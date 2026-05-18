const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security middleware ───────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false // disabled so frontend CDN fonts load
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*', // set to your domain in production
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '50kb' })); // prevent giant payloads

// ─── Rate limiting ─────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 30,                      // 30 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait 15 minutes and try again.' }
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 5,                       // 5 analyze calls per minute per IP
  message: { error: 'Rate limit: max 5 analyses per minute.' }
});

app.use(limiter);

// ─── Serve frontend ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Supported languages whitelist ────────────────────────────────────────
const SUPPORTED_LANGS = new Set([
  'java', 'python', 'javascript', 'typescript', 'cpp', 'c', 'go', 'rust'
]);

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: 'claude-sonnet-4-20250514',
    timestamp: new Date().toISOString()
  });
});

// ─── Analyze endpoint ──────────────────────────────────────────────────────
app.post('/api/analyze', strictLimiter, async (req, res) => {
  const { code, language } = req.body;

  // ── Validation ────────────────────────────────────────────────────────
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "code" field.' });
  }
  if (!language || !SUPPORTED_LANGS.has(language)) {
    return res.status(400).json({ error: `Unsupported language. Supported: ${[...SUPPORTED_LANGS].join(', ')}` });
  }
  if (code.length > 20000) {
    return res.status(400).json({ error: 'Code too long. Max 20,000 characters.' });
  }
  const prompt = buildPrompt(language, code);

  const useOpenAI = process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL;
  const useAnthropic = !useOpenAI && process.env.ANTHROPIC_API_KEY;

  if (!useOpenAI && !useAnthropic) {
    return res.status(500).json({ error: 'Server misconfigured: API key not set. Set OPENAI_API_KEY/OPENAI_BASE_URL or ANTHROPIC_API_KEY.' });
  }

  try {
    let apiRes;

    if (useOpenAI) {
      const openaiBase = process.env.OPENAI_BASE_URL.replace(/\/$/, '');
      const openaiModel = process.env.OPENAI_MODEL || 'nvidia/nemotron-3-super-120b-a12b';

      apiRes = await fetch(`${openaiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096
        })
      });
    } else {
      apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      });
    }

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error('AI provider error:', apiRes.status, errBody);

      if (apiRes.status === 429) {
        return res.status(429).json({ error: 'AI model rate limit reached. Please try again in a moment.' });
      }
      if (apiRes.status === 401) {
        return res.status(500).json({ error: 'Server API key invalid. Contact administrator.' });
      }
      return res.status(502).json({ error: 'AI service unavailable. Try again later.' });
    }

    const data = await apiRes.json();

    // Support both Anthropic and OpenAI-style responses
    let rawText = '';
    if (data.content) {
      rawText = data.content?.[0]?.text?.trim() ?? '';
    } else if (data.choices && data.choices[0]) {
      if (data.choices[0].message && data.choices[0].message.content) {
        rawText = data.choices[0].message.content.trim();
      } else if (typeof data.choices[0].text === 'string') {
        rawText = data.choices[0].text.trim();
      }
    }

    // Strip markdown fences if model added them anyway
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      console.error('JSON parse failed. Raw:', rawText.slice(0, 300));
      return res.status(502).json({ error: 'AI returned malformed response. Please retry.' });
    }

    // Validate required fields
    if (!result.bugs || !Array.isArray(result.bugs)) {
      result.bugs = [];
    }
    if (typeof result.score !== 'number') result.score = 50;
    if (!result.summary) result.summary = 'Analysis complete.';
    if (!result.score_label) result.score_label = scoreLabel(result.score);

    return res.json({ success: true, result });

  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Network error reaching AI service. Check server connectivity.' });
  }
});

// ─── 404 fallback → serve frontend SPA ────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Helpers ───────────────────────────────────────────────────────────────
function scoreLabel(n) {
  if (n >= 91) return 'Excellent';
  if (n >= 71) return 'Good';
  if (n >= 41) return 'Fair';
  return 'Needs Work';
}

function buildPrompt(lang, code) {
  return `You are an elite ${lang} code security and quality engineer with deep expertise in static analysis, runtime bugs, and software best practices.

Analyze the following ${lang} code thoroughly and respond with ONLY a raw JSON object — no markdown, no backticks, no explanations outside the JSON.

JSON schema:
{
  "summary": "One precise sentence describing the code and its primary issue(s)",
  "bugs": [
    {
      "id": 1,
      "severity": "critical|warning|info",
      "title": "Concise bug name (≤8 words)",
      "line": "e.g. 12, or 12-15, or N/A",
      "description": "Clear technical explanation of the bug and why it is dangerous",
      "fix_explanation": "Specific, actionable steps to fix this bug",
      "fixed_code": "Corrected code snippet for this specific bug only"
    }
  ],
  "full_fixed_code": "Complete corrected version of the entire program with all bugs fixed",
  "score": 42,
  "score_label": "Needs Work"
}

Rules:
- severity: critical = crash / security vulnerability / data loss / undefined behaviour; warning = logic error / bad practice / resource leak; info = style / minor optimization
- score 0–100: 0–40 = Needs Work, 41–70 = Fair, 71–90 = Good, 91–100 = Excellent
- Find ALL bugs. Be precise with line numbers. Include at least one entry per distinct bug.
- full_fixed_code must be complete and compilable/runnable — not a snippet.
- If no bugs found, set bugs to [] and score to 95+.

Code to analyze (${lang}):
\`\`\`${lang}
${code}
\`\`\``;
}

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const providerLabel = process.env.OPENAI_API_KEY ? `OpenAI-compatible (${process.env.OPENAI_BASE_URL})` : 'Anthropic';
  const modelLabel = process.env.OPENAI_MODEL || (process.env.OPENAI_API_KEY ? 'nvidia/nemotron-3-super-120b-a12b' : 'claude-sonnet-4-20250514');
  const keySet = process.env.OPENAI_API_KEY ? '✓ set (OPENAI_API_KEY)' : (process.env.ANTHROPIC_API_KEY ? '✓ set (ANTHROPIC_API_KEY)' : '✗ MISSING');

  console.log(`\n🚀 BugFix AI backend running on http://localhost:${PORT}`);
  console.log(`   Provider: ${providerLabel}`);
  console.log(`   Model   : ${modelLabel}`);
  console.log(`   Env     : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Key     : ${keySet}\n`);
});

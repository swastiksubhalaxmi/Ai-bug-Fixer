# BugFix AI 🐛

> AI-powered code bug analyzer built with Node.js + Express + Anthropic Claude API.  
> Full-stack project for Java internship submission (Cisco / campus placements).

---

## 🗂️ Project Structure

```
bugfix-ai/
├── server.js          ← Express backend (API proxy, rate limiting, security)
├── package.json
> Premium README — polished, deploy-ready documentation for BugFix AI

Small, fast, secure Express proxy that analyzes source code using an LLM-powered model and returns a structured bug report.

Features
- Secure server-side AI proxy (keeps API keys off the client)
- Provider-agnostic: supports Anthropic or OpenAI-compatible providers (NVIDIA Integrate)
- Rate-limited and hardened with Helmet + input validation
- Simple frontend that calls `/api/analyze` (no client-side API keys)

Table of contents
- Quick Start
- Configuration (env vars)
- Running (dev & prod)
- API reference
- Examples
- Deploying
- Troubleshooting & FAQ
- Contributing

Quick Start (Windows)
1) Install dependencies
```powershell
npm install
```
2) Create `.env` from the template and set credentials
```powershell
copy .env.example .env
# Edit .env and set either OPENAI_BASE_URL & OPENAI_API_KEY OR ANTHROPIC_API_KEY
```
3) Start the server
```powershell
npm start
# Open http://localhost:3000
```

Development (hot reload)
```powershell
npm run dev
```

Configuration (environment variables)
- OPENAI_BASE_URL — base URL for OpenAI-compatible providers (e.g. https://integrate.api.nvidia.com/v1)
- OPENAI_API_KEY — API key for OpenAI-compatible provider (nvapi-...)
- OPENAI_MODEL — optional override model for OpenAI-compatible provider (default: nvidia/nemotron-3-super-120b-a12b)
- ANTHROPIC_API_KEY — legacy Anthropic key (used when OPENAI_ vars are not set)
- PORT — server port (default 3000)
- NODE_ENV — set to `production` in deployments
- ALLOWED_ORIGIN — optional CORS origin restriction

How provider selection works
- If both `OPENAI_BASE_URL` and `OPENAI_API_KEY` are present, the server will call `${OPENAI_BASE_URL}/chat/completions` with `Authorization: Bearer <OPENAI_API_KEY>`.
- Otherwise, the server falls back to Anthropic and calls their `https://api.anthropic.com/v1/messages` endpoint using `x-api-key`.

API reference
GET /api/health
- Returns server status and model/provider info.

POST /api/analyze
- Request body (JSON):
  - `code` (string) — source to analyze (max 20,000 chars)
  - `language` (string) — one of: java, python, javascript, typescript, cpp, c, go, rust

Example request (curl)
```bash
curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"language":"java","code":"public class X { }"}'
```

Response (successful)
```json
{
  "success": true,
  "result": { "summary": "...", "bugs": [], "full_fixed_code": "...", "score": 95 }
}
```

Examples
- See `examples/nvidia_client.py` for a Python streaming example using an OpenAI-compatible NVIDIA Integrate endpoint.

Security & best practices
- Never commit `.env` or API keys. `.gitignore` already excludes `.env`.
- Use deployment platform environment variables (Railway/Render/Vercel) rather than committing secrets.
- Set `ALLOWED_ORIGIN` in production to restrict CORS.

Deploying
- Push to GitHub, then deploy to a provider (Railway, Render, Fly): set provider env vars in the dashboard and `NODE_ENV=production`.

Troubleshooting
- 401 errors: verify `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` values and ensure they haven't expired or been rotated.
- 429 rate-limit errors: reduce request frequency or upgrade your provider plan.
- Model returns malformed JSON: the server strips common markdown fences before attempting to parse — if the provider still returns non-JSON, inspect the raw response logged to the server console.

Contributing
- Fork, create a branch, run tests (none included), and open a PR. Keep secrets out of PRs.

License
- MIT

import os
from openai import OpenAI


def main():
    base_url = os.environ.get("OPENAI_BASE_URL")
    api_key = os.environ.get("OPENAI_API_KEY")

    if not base_url or not api_key:
        raise RuntimeError("Please set OPENAI_BASE_URL and OPENAI_API_KEY in your environment.")

    client = OpenAI(
        base_url=base_url,
        api_key=api_key,
    )

    completion = client.chat.completions.create(
        model="nvidia/nemotron-3-super-120b-a12b",
        messages=[{"role": "user", "content": "Hello"}],
        temperature=1,
        top_p=0.95,
        max_tokens=1024,
        extra_body={"chat_template_kwargs": {"enable_thinking": True}, "reasoning_budget": 16384},
        stream=True,
    )

    for chunk in completion:
        if not chunk.choices:
            continue
        reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
        if reasoning:
            print(reasoning, end="")
        if chunk.choices[0].delta.content is not None:
            print(chunk.choices[0].delta.content, end="")


if __name__ == "__main__":
    main()

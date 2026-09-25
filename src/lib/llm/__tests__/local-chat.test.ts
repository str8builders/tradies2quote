import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { FetchTimeoutError } from "@/lib/fetchTimeout";
import { AiError } from "@/lib/ai/errors";
import {
  buildLocalJsonSchemaResponseFormat,
  clampLocalMaxTokens,
  DEFAULT_LOCAL_LLM_MAX_TOKENS,
  DEFAULT_LOCAL_LLM_TIMEOUT_MS,
  isLocalTextAiProvider,
  postJsonWithoutHeaderTimeout,
  resolveLocalLlmConfig,
  runLocalChatCompletion,
  toChatCompletionsUrl,
} from "../local-chat";

describe("local chat configuration", () => {
  it("recognises only the explicit local provider", () => {
    expect(isLocalTextAiProvider("LOCAL")).toBe(true);
    expect(isLocalTextAiProvider("openai")).toBe(false);
    expect(isLocalTextAiProvider(undefined)).toBe(false);
  });

  it("normalises an OpenAI-compatible base URL", () => {
    expect(toChatCompletionsUrl("http://127.0.0.1:8088/v1/")).toBe(
      "http://127.0.0.1:8088/v1/chat/completions",
    );
  });

  it("fails with an env name and never a secret value", () => {
    expect(() =>
      resolveLocalLlmConfig(
        {},
        {
          LOCAL_LLM_BASE_URL: "http://127.0.0.1:8088/v1",
          LOCAL_LLM_MODEL: "qwen",
        },
      ),
    ).toThrow("LOCAL_LLM_API_KEY");
  });

  it("defaults to a 30-minute timeout and 2048-token ceiling", () => {
    const config = resolveLocalLlmConfig(
      {},
      {
        LOCAL_LLM_BASE_URL: "http://127.0.0.1:8088/v1",
        LOCAL_LLM_API_KEY: "test-key",
        LOCAL_LLM_MODEL: "qwen",
      },
    );
    expect(config.timeoutMs).toBe(DEFAULT_LOCAL_LLM_TIMEOUT_MS);
    expect(config.maxTokensCeiling).toBe(DEFAULT_LOCAL_LLM_MAX_TOKENS);
    expect(clampLocalMaxTokens(4096, config.maxTokensCeiling)).toBe(2048);
  });

  it("parses configurable timeout and token ceilings", () => {
    const config = resolveLocalLlmConfig(
      {},
      {
        LOCAL_LLM_BASE_URL: "http://127.0.0.1:8088/v1",
        LOCAL_LLM_API_KEY: "test-key",
        LOCAL_LLM_MODEL: "qwen",
        LOCAL_LLM_TIMEOUT_MS: "900000",
        LOCAL_LLM_MAX_TOKENS: "512",
      },
    );
    expect(config.timeoutMs).toBe(900000);
    expect(config.maxTokensCeiling).toBe(512);
  });

  it("builds json_schema output for shaped schemas without hosted-only strict mode", () => {
    const format = buildLocalJsonSchemaResponseFormat({
      name: "answer",
      schema: { type: "object", properties: { ok: { type: "boolean" } } },
    });
    expect(format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "answer" },
    });
    expect(format).not.toHaveProperty("json_schema.strict");
  });

  it("sends a shapeless object schema as plain json_object mode", () => {
    expect(
      buildLocalJsonSchemaResponseFormat({
        name: "quote",
        description: "anything",
        schema: { type: "object" },
      }),
    ).toEqual({ type: "json_object" });
  });
});

describe("postJsonWithoutHeaderTimeout", () => {
  async function listen(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Promise<{ url: string; close: () => Promise<void> }> {
    const server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    return {
      url: `http://127.0.0.1:${address.port}/v1/chat/completions`,
      close: () => new Promise((resolve) => server.close(() => resolve())),
    };
  }

  it("waits past a slow header phase and returns the JSON body", async () => {
    let received = "";
    const server = await listen((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        received = Buffer.concat(chunks).toString();
        // Headers deliberately delayed: this is the phase undici gives up on.
        setTimeout(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
        }, 400);
      });
    });
    try {
      const res = await postJsonWithoutHeaderTimeout(
        server.url,
        { authorization: "Bearer t", "content-type": "application/json" },
        JSON.stringify({ model: "m" }),
        5_000,
      );
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ choices: [{ message: { content: "OK" } }] });
      expect(JSON.parse(received)).toEqual({ model: "m" });
    } finally {
      await server.close();
    }
  });

  it("aborts with FetchTimeoutError once the caller's budget is spent", async () => {
    const server = await listen(() => {
      /* never respond */
    });
    try {
      await expect(
        postJsonWithoutHeaderTimeout(server.url, {}, "{}", 150),
      ).rejects.toBeInstanceOf(FetchTimeoutError);
    } finally {
      await server.close();
    }
  });

  it("exposes non-2xx statuses with their body text", async () => {
    const server = await listen((_req, res) => {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("loading model");
    });
    try {
      const res = await postJsonWithoutHeaderTimeout(server.url, {}, "{}", 2_000);
      expect(res.ok).toBe(false);
      expect(res.status).toBe(503);
      expect(await res.text()).toBe("loading model");
    } finally {
      await server.close();
    }
  });

  it("gives the node:http path the shared retry policy (503 → 200)", async () => {
    let hits = 0;
    const server = await listen((req, res) => {
      req.resume();
      req.on("end", () => {
        hits += 1;
        if (hits === 1) {
          // llama.cpp answers 503 while the model is still loading.
          res.writeHead(503, { "content-type": "text/plain", "retry-after": "0" });
          res.end("loading model");
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }));
      });
    });
    try {
      const result = await runLocalChatCompletion({
        baseUrl: server.url.replace(/\/chat\/completions$/, ""),
        apiKey: "k",
        model: "m",
        system: "s",
        user: "u",
      });
      expect(hits).toBe(2);
      expect(result.text).toBe("{}");
    } finally {
      await server.close();
    }
  });

  it("types a local timeout and does not retry it", async () => {
    let hits = 0;
    const server = await listen(() => {
      hits += 1; // never respond
    });
    try {
      const err = await runLocalChatCompletion({
        baseUrl: server.url.replace(/\/chat\/completions$/, ""),
        apiKey: "k",
        model: "m",
        timeoutMs: 150,
        system: "s",
        user: "u",
      }).catch((e) => e);
      expect(err).toBeInstanceOf(AiError);
      expect(err.kind).toBe("timeout");
      expect(err.provider).toBe("local");
      expect(hits).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("flags a length stop as truncated for the caller to handle", async () => {
    const server = await listen((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"a":' } }] }));
      });
    });
    try {
      const result = await runLocalChatCompletion({
        baseUrl: server.url.replace(/\/chat\/completions$/, ""),
        apiKey: "k",
        model: "m",
        system: "s",
        user: "u",
      });
      expect(result.truncated).toBe(true);
      expect(result.finishReason).toBe("length");
    } finally {
      await server.close();
    }
  });

  it("drives runLocalChatCompletion end to end without a fetch implementation", async () => {
    const server = await listen((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify({ format: body.response_format }) },
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 2 },
          }),
        );
      });
    });
    try {
      const result = await runLocalChatCompletion({
        baseUrl: server.url.replace(/\/chat\/completions$/, ""),
        apiKey: "k",
        model: "m",
        system: "s",
        user: "u",
        responseSchema: { name: "quote", schema: { type: "object" } },
      });
      expect(JSON.parse(result.text)).toEqual({ format: { type: "json_object" } });
      expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
    } finally {
      await server.close();
    }
  });
});

describe("runLocalChatCompletion", () => {
  it("posts to the local endpoint and returns content", async () => {
    let requestedUrl = "";
    let requestedBody: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [
            { finish_reason: "stop", message: { content: '{"ok":true}' } },
          ],
          usage: { prompt_tokens: 8, completion_tokens: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await runLocalChatCompletion({
      baseUrl: "http://127.0.0.1:8088/v1",
      apiKey: "test-secret",
      model: "qwen-test",
      system: "Return JSON.",
      user: "Say yes.",
      maxTokens: 9999,
      responseSchema: {
        name: "answer",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
      fetchImpl,
    });

    expect(requestedUrl).toBe(
      "http://127.0.0.1:8088/v1/chat/completions",
    );
    expect(requestedBody).toHaveProperty("response_format.type", "json_schema");
    expect(requestedBody).toHaveProperty("max_tokens", 2048);
    expect(result).toMatchObject({
      text: '{"ok":true}',
      model: "qwen-test",
      usage: { inputTokens: 8, outputTokens: 4 },
    });
  });
});

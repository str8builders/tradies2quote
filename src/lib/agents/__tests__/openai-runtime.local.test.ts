import { describe, expect, it } from "vitest";
import {
  buildOpenAIRequestBody,
  extractOpenAIJsonContent,
} from "../openai-runtime";

const TOOL = {
  name: "emit_answer",
  description: "Return an answer.",
  schema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
  },
};

describe("local OpenAI-compatible structured output", () => {
  it("uses json_schema without function tools", () => {
    const body = buildOpenAIRequestBody({
      model: "qwen-test",
      messages: [{ role: "user", content: "hello" }],
      tool: TOOL,
      maxTokens: 128,
      temperature: 0,
      outputFormat: "json_schema",
    });

    expect(body).toHaveProperty("response_format.type", "json_schema");
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
  });

  it("keeps cloud function-calling as the default", () => {
    const body = buildOpenAIRequestBody({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
      tool: TOOL,
      maxTokens: 128,
      temperature: 0,
    });

    expect(body).toHaveProperty("tools.0.function.name", "emit_answer");
    expect(body).toHaveProperty(
      "tool_choice.function.name",
      "emit_answer",
    );
    expect(body).not.toHaveProperty("response_format");
  });

  it("parses json_schema content", () => {
    expect(
      extractOpenAIJsonContent(
        { choices: [{ message: { content: '{"answer":"yes"}' } }] },
        "emit_answer",
      ),
    ).toEqual({ answer: "yes" });
  });
});

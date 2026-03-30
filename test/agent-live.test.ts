import { describe, expect, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { buildAgentPrompt, buildDoctorPrompt } from "../src/agent";
import { TOOLS as OPENAI_TOOLS } from "../src/agent-openai";
import { gatherContext } from "../src/context";
import { MODELS } from "../src/provider";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!ANTHROPIC_KEY || !OPENAI_KEY) {
  throw new Error("Both ANTHROPIC_API_KEY and OPENAI_API_KEY must be set to run tests.");
}

const TIMEOUT = 60_000;

// Anthropic-format tool definitions (equivalent to OpenAI TOOLS)
const ANTHROPIC_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "bash_execute",
    description: "Execute a bash command and return its stdout and stderr output.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The bash command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file at the given absolute path.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to read" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "ask_user_question",
    description:
      "Ask the user a question with multiple-choice options. Use this BEFORE running any command that modifies state.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "The question to ask" },
        header: { type: "string", description: "Short header for the question" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
            },
            required: ["label"],
          },
        },
      },
      required: ["question", "options"],
    },
  },
];

// Shared context and prompts — built once for the whole test file
let agentSystemPrompt: string;
let doctorSystemPrompt: string;

const agentUserPrompt = "My git push was rejected. Help me figure out why and fix it.";
const doctorUserPrompt =
  "Look at my recent terminal output. What went wrong? Diagnose the issue and help me fix it.";
const doctorTerminalOutput = `$ git push origin main
To github.com:user/repo.git
 ! [rejected]        main -> main (non-fast-forward)
error: failed to push some refs to 'github.com:user/repo.git'
hint: Updates were rejected because the tip of your current branch is behind`;

// Build prompts before tests run
const contextPromise = gatherContext({ doctor: false }).then((ctx) => {
  agentSystemPrompt = buildAgentPrompt(ctx);
});
const doctorContextPromise = gatherContext({
  doctor: true,
  terminalOutput: doctorTerminalOutput,
  lastCommand: "git push origin main",
}).then((ctx) => {
  doctorSystemPrompt = buildDoctorPrompt(ctx, true);
});

describe("Agent mode — OpenAI", () => {
  test(
    "model responds with tool calls or text for agent prompt",
    async () => {
      await contextPromise;
      const client = new OpenAI({ apiKey: OPENAI_KEY! });

      const response = await client.chat.completions.create({
        model: MODELS.openai.agent,
        messages: [
          { role: "system", content: agentSystemPrompt },
          { role: "user", content: agentUserPrompt },
        ],
        tools: OPENAI_TOOLS,
      });

      const message = response.choices[0]?.message;
      expect(message).toBeDefined();
      // Model should respond with either text, tool calls, or both
      const hasContent = !!message.content;
      const hasToolCalls = !!message.tool_calls && message.tool_calls.length > 0;
      expect(hasContent || hasToolCalls).toBe(true);
    },
    TIMEOUT,
  );
});

describe("Doctor mode — OpenAI", () => {
  test(
    "model responds with tool calls or text for doctor prompt",
    async () => {
      await doctorContextPromise;
      const client = new OpenAI({ apiKey: OPENAI_KEY! });

      const response = await client.chat.completions.create({
        model: MODELS.openai.agent,
        messages: [
          { role: "system", content: doctorSystemPrompt },
          { role: "user", content: doctorUserPrompt },
        ],
        tools: OPENAI_TOOLS,
      });

      const message = response.choices[0]?.message;
      expect(message).toBeDefined();
      const hasContent = !!message.content;
      const hasToolCalls = !!message.tool_calls && message.tool_calls.length > 0;
      expect(hasContent || hasToolCalls).toBe(true);
    },
    TIMEOUT,
  );
});

describe("Agent mode — Anthropic", () => {
  test(
    "model responds with tool use or text for agent prompt",
    async () => {
      await contextPromise;
      const client = new Anthropic({ apiKey: ANTHROPIC_KEY! });

      const response = await client.messages.create({
        model: MODELS.anthropic.agent,
        max_tokens: 1024,
        system: agentSystemPrompt,
        messages: [{ role: "user", content: agentUserPrompt }],
        tools: ANTHROPIC_TOOLS,
      });

      expect(response.content).toBeArray();
      expect(response.content.length).toBeGreaterThan(0);
      // Model should respond with text blocks, tool_use blocks, or both
      const hasText = response.content.some((b) => b.type === "text");
      const hasToolUse = response.content.some((b) => b.type === "tool_use");
      expect(hasText || hasToolUse).toBe(true);
    },
    TIMEOUT,
  );
});

describe("Doctor mode — Anthropic", () => {
  test(
    "model responds with tool use or text for doctor prompt",
    async () => {
      await doctorContextPromise;
      const client = new Anthropic({ apiKey: ANTHROPIC_KEY! });

      const response = await client.messages.create({
        model: MODELS.anthropic.agent,
        max_tokens: 1024,
        system: doctorSystemPrompt,
        messages: [{ role: "user", content: doctorUserPrompt }],
        tools: ANTHROPIC_TOOLS,
      });

      expect(response.content).toBeArray();
      expect(response.content.length).toBeGreaterThan(0);
      const hasText = response.content.some((b) => b.type === "text");
      const hasToolUse = response.content.some((b) => b.type === "tool_use");
      expect(hasText || hasToolUse).toBe(true);
    },
    TIMEOUT,
  );
});

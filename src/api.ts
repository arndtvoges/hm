import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Provider } from "./provider";
import { MODELS } from "./provider";

export interface HmResponse {
  command: string;
  summary: string;
  dangerous: boolean;
}

const TOOL_SCHEMA = {
  command: { type: "string" as const, description: "The shell command to execute" },
  summary: {
    type: "string" as const,
    description: "One-line human-readable summary of what the command does",
  },
  dangerous: {
    type: "boolean" as const,
    description: "Whether this command is destructive or irreversible",
  },
};

function buildSystemPrompt(): string {
  return `You are a shell command generator. Given a natural language description, return the appropriate shell command for the user's system.

Context:
- Working directory: ${process.cwd()}
- Shell: ${process.env.SHELL || "/bin/bash"}
- OS: ${process.platform} (${process.arch})

Rules:
- Return exactly ONE command (use && or | for multi-step)
- Commands MUST be compatible with the user's OS (e.g. macOS uses BSD coreutils, not GNU)
- Prefer built-in commands over external tools when possible
- Always prefer commands that produce visible output. If a command would silently succeed or fail with no output, add an echo or similar to confirm what happened (e.g. use \`&& echo "Done"\` or \`|| echo "Failed"\`)
- Flag commands as dangerous if they delete data, modify system config, require sudo, or are otherwise irreversible
- The summary should be a brief, plain-English description of what the command does`;
}

export async function generateCommand(
  prompt: string,
  apiKey: string,
  provider: Provider = "anthropic",
): Promise<HmResponse> {
  return provider === "openai"
    ? generateCommandOpenAI(prompt, apiKey)
    : generateCommandAnthropic(prompt, apiKey);
}

async function generateCommandAnthropic(prompt: string, apiKey: string): Promise<HmResponse> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODELS.anthropic.command,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    tools: [
      {
        name: "execute_command",
        description:
          "Return a shell command to execute based on the user's natural language description.",
        input_schema: {
          type: "object" as const,
          properties: TOOL_SCHEMA,
          required: ["command", "summary", "dangerous"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "execute_command" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolBlock) {
    throw new Error("Unexpected API response. Try again, or file an issue if this persists.");
  }

  const input = toolBlock.input as HmResponse;
  return { command: input.command, summary: input.summary, dangerous: input.dangerous };
}

async function generateCommandOpenAI(prompt: string, apiKey: string): Promise<HmResponse> {
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: MODELS.openai.command,
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: prompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "execute_command",
          description:
            "Return a shell command to execute based on the user's natural language description.",
          parameters: {
            type: "object",
            properties: TOOL_SCHEMA,
            required: ["command", "summary", "dangerous"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "execute_command" } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Unexpected API response. Try again, or file an issue if this persists.");
  }

  const input = JSON.parse(toolCall.function.arguments) as HmResponse;
  return { command: input.command, summary: input.summary, dangerous: input.dangerous };
}

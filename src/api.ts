import Anthropic from "@anthropic-ai/sdk";

export interface HmResponse {
  command: string;
  summary: string;
  dangerous: boolean;
}

export async function generateCommand(
  prompt: string,
  apiKey: string
): Promise<HmResponse> {
  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are a shell command generator. Given a natural language description, return the appropriate shell command for the user's system.

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

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [
      {
        name: "execute_command",
        description:
          "Return a shell command to execute based on the user's natural language description.",
        input_schema: {
          type: "object" as const,
          properties: {
            command: {
              type: "string",
              description: "The shell command to execute",
            },
            summary: {
              type: "string",
              description: "One-line human-readable summary of what the command does",
            },
            dangerous: {
              type: "boolean",
              description:
                "Whether this command is destructive or irreversible",
            },
          },
          required: ["command", "summary", "dangerous"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "execute_command" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use"
  );

  if (!toolBlock) {
    throw new Error("Unexpected API response. Try again, or file an issue if this persists.");
  }

  const input = toolBlock.input as HmResponse;

  return {
    command: input.command,
    summary: input.summary,
    dangerous: input.dangerous,
  };
}

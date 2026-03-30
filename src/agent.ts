import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { runAgentModeOpenAI } from "./agent-openai";
import { DIM, RESET } from "./color";
import { type GatherContextOptions, gatherContext } from "./context";
import type { Provider } from "./provider";
import type { SelectorOption } from "./selector";
import { selector } from "./selector";
import { agentSpinner, doctorSpinner } from "./spinner";

export function buildAgentPrompt(context: string): string {
  return `You are a devops debugging agent. Your job is to diagnose and fix environment, deployment, and infrastructure issues.

You have access to the user's system context, shell history, and environment (provided below).

You can freely read files, search the codebase, and inspect config to understand the situation — these actions do not require user confirmation.

**Before running any command that executes a process, modifies state, or could have side effects**: stop and ask the user for confirmation using AskUserQuestion. Present the commands you want to run as part of the question text, with "Run these steps", "Skip", and "Abort" as options.

Format your proposals clearly: a short summary of what you think is going on, followed by numbered steps with the command and reasoning for each. For example:

AskUserQuestion with a single question where:
- The question text contains your summary and numbered steps like:
  "Your railway.toml points to a Dockerfile that doesn't exist.

  1. ls -la docker/           — Check what's in the docker directory
  2. railway logs --latest    — Pull recent deploy logs"
- The header is "Next steps"
- The options are:
  - "Run these steps" — Execute the commands above
  - "Skip" — Skip these and keep investigating
  - "Abort" — Exit agent mode

After the user confirms and commands run, assess the results. Either propose more diagnostic steps or propose a fix.

If the user picks "Something different" (the auto-provided Other option), ask what they'd like to do instead and follow their direction.

If the user picks "Abort", stop immediately.

When you believe the issue is resolved, say "Looks like it's fixed" and stop.

---

# System Context

${context}`;
}

export function buildDoctorPrompt(context: string, hasTerminalOutput: boolean): string {
  const rerunInstruction = hasTerminalOutput
    ? ""
    : `
**No terminal scrollback is available.** You have the user's last command from shell history. Re-run it yourself to see the output — this is a read-only diagnostic step. If the command could modify state or is potentially dangerous, propose it via AskUserQuestion first. Otherwise, just run it.

`;
  return `You are a terminal doctor. The user hit an error and typed "hm" for help.
${rerunInstruction}
**Response format — be brief and direct:**
1. One-line diagnosis: what went wrong
2. One-line cause (if not obvious from the diagnosis)
3. The correct command or what to do next

If the fix is just "run the right command" or "fix a typo", say so plainly and stop. Not everything needs a multi-step fix. For example, if the user typed "gti status" instead of "git status", just say: "Typo: \`gti\` → \`git\`. Run \`git status\`." and stop.

Only use AskUserQuestion when the fix involves commands that modify state (installing packages, editing config files, changing system settings, etc.). In that case:
- The question text starts with your short diagnosis, then lists numbered fix steps with commands
- The header is "Fix"
- The options are:
  - "Run fix" — Execute the commands above
  - "Skip" — Don't execute, just exit
  - "Abort" — Exit immediately

Do NOT write long explanations, markdown headers, or walls of text. Be terse. Think "doctor giving a diagnosis", not "professor giving a lecture".

If the user picks "Run fix" and the commands succeed, say "Fixed." and stop.
If the user picks "Something different", follow their direction.
If the user picks "Abort" or "Skip", stop immediately.

---

# System Context

${context}`;
}

function buildSystemPrompt(context: string, doctor?: boolean, hasTerminalOutput?: boolean): string {
  return doctor
    ? buildDoctorPrompt(context, hasTerminalOutput ?? false)
    : buildAgentPrompt(context);
}

export interface AgentModeOptions {
  doctor?: boolean;
  terminalOutput?: string | null;
  lastCommand?: string | null;
}

export async function runAgentMode(
  prompt: string,
  apiKey: string,
  options?: AgentModeOptions,
  provider: Provider = "anthropic",
): Promise<void> {
  if (provider === "openai") {
    return runAgentModeOpenAI(prompt, apiKey, options);
  }

  // The agent SDK reads the API key from process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = apiKey;

  const isDoctor = options?.doctor ?? false;

  let stopSpinner: (() => void) | null = null;

  const spin = isDoctor
    ? doctorSpinner("Analyzing your terminal session")
    : agentSpinner("Working on it in agent mode");
  stopSpinner = () => spin.stop();

  const contextOpts: GatherContextOptions = {
    doctor: isDoctor,
    terminalOutput: options?.terminalOutput,
    lastCommand: options?.lastCommand,
  };
  const context = await gatherContext(contextOpts);

  const systemPrompt = buildSystemPrompt(context, isDoctor, !!options?.terminalOutput);

  // When true, Bash commands are auto-approved until the next AskUserQuestion proposal
  let bashApproved = false;

  // In doctor mode without scrollback, allow one diagnostic re-run without approval
  let diagnosticRunAllowed = isDoctor && !options?.terminalOutput;

  const APPROVAL_LABELS = new Set(["run these steps", "run fix"]);

  const agentQuery = query({
    prompt:
      prompt ||
      (isDoctor
        ? options?.terminalOutput
          ? "Look at my recent terminal output. What went wrong? Diagnose the issue and help me fix it."
          : "I don't have terminal scrollback, but look at my shell history and system context. Figure out what went wrong with my last command and help me fix it."
        : "Look at my shell history and system context. Figure out what I'm struggling with and help me fix it."),
    options: {
      model: "claude-opus-4-6",
      systemPrompt,
      tools: ["Bash", "Read", "Glob", "Grep", "AskUserQuestion"],
      allowedTools: ["Read", "Glob", "Grep"],
      includePartialMessages: false,
      maxTurns: 50,
      canUseTool: async (toolName, input, _options): Promise<PermissionResult> => {
        // AskUserQuestion — render interactive selector
        if (toolName === "AskUserQuestion") {
          // New proposal — reset approval until user confirms
          bashApproved = false;

          const questions = (input as Record<string, unknown>).questions as Array<{
            question: string;
            header: string;
            options: Array<{ label: string; description: string }>;
            multiSelect: boolean;
          }>;

          const answers: Record<string, string> = {};

          for (const q of questions) {
            // Print the question text at normal weight
            process.stdout.write(`\n${q.question}\n\n`);

            // Build selector options from the AskUserQuestion options
            const selectorOptions: SelectorOption[] = q.options.map((opt) => ({
              label: opt.label,
              description: opt.description,
            }));

            // Add "Something different" option
            selectorOptions.push({
              label: "Something different",
              description: "Tell me what to do instead",
            });

            const selection = await selector(selectorOptions);

            const selectionLower = selection.toLowerCase();

            if (selectionLower === "abort") {
              return {
                behavior: "deny",
                message: "User aborted",
                interrupt: true,
              };
            }

            if (APPROVAL_LABELS.has(selectionLower)) {
              bashApproved = true;
              answers[q.question] = selection;
            } else if (selectionLower === "skip") {
              bashApproved = false;
              answers[q.question] = selection;
            } else {
              // "Something different" — selector already handled the text input prompt
              bashApproved = false;
              answers[q.question] = selection;
            }
          }

          return {
            behavior: "allow",
            updatedInput: {
              questions: (input as Record<string, unknown>).questions,
              answers,
            },
          };
        }

        // Bash — auto-approve if user confirmed, otherwise ask first
        if (toolName === "Bash") {
          if (bashApproved) {
            return { behavior: "allow", updatedInput: input };
          }
          // Allow one diagnostic re-run in doctor mode (when no scrollback),
          // but only if the command looks read-only (no pipes, redirects, writes)
          if (diagnosticRunAllowed) {
            diagnosticRunAllowed = false;
            const cmd =
              typeof (input as Record<string, unknown>).command === "string"
                ? ((input as Record<string, unknown>).command as string)
                : "";
            const looksDestructive = /\b(rm|sudo|kill|mkfs|dd)\b|>\s|>>/.test(cmd);
            if (!looksDestructive) {
              return { behavior: "allow", updatedInput: input };
            }
          }
          return {
            behavior: "deny",
            message:
              "Please propose this command to the user first using AskUserQuestion before running it.",
          };
        }

        // Read, Glob, Grep — auto-approve (this is a fallback; they should be
        // auto-approved via allowedTools, but handle just in case)
        return { behavior: "allow", updatedInput: input };
      },
    },
  });

  try {
    for await (const message of agentQuery) {
      // Skip streaming events — we only care about complete messages
      if (message.type === "stream_event") {
        continue;
      }

      if (message.type === "assistant") {
        if (stopSpinner) {
          stopSpinner();
          stopSpinner = null;
        }
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === "object" && block !== null && "type" in block) {
              if (block.type === "text" && "text" in block && typeof block.text === "string") {
                process.stdout.write(`${block.text}\n`);
              }
              if (block.type === "tool_use" && "name" in block && typeof block.name === "string") {
                if (block.name !== "AskUserQuestion") {
                  const input = "input" in block ? (block.input as Record<string, unknown>) : {};
                  let detail = "";
                  if (block.name === "Bash" && typeof input.command === "string") {
                    detail = ` — ${input.command}`;
                  } else if (block.name === "Read" && typeof input.file_path === "string") {
                    detail = ` — ${input.file_path}`;
                  } else if (block.name === "Glob" && typeof input.pattern === "string") {
                    detail = ` — ${input.pattern}`;
                  } else if (block.name === "Grep" && typeof input.pattern === "string") {
                    detail = ` — ${input.pattern}`;
                  }
                  process.stdout.write(`${DIM}  tool: ${block.name}${detail}${RESET}\n`);
                }
              }
            }
          }
        }
        continue;
      }

      if (message.type === "result") {
        if (message.subtype !== "success") {
          const errMsg = message as Record<string, unknown>;
          if (Array.isArray(errMsg.errors) && errMsg.errors.length > 0) {
            process.stderr.write(`\nAgent error: ${errMsg.errors.join(", ")}\n`);
            process.stderr.write(
              `Try running again. If this persists, check your API key or internet connection.\n`,
            );
          }
        }
        break;
      }
    }
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nAgent error: ${errMessage}\n`);
    process.stderr.write(
      `Try running again. If this persists, check your API key or internet connection.\n`,
    );
  }
}

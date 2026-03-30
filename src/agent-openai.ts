import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { type AgentModeOptions, buildAgentPrompt, buildDoctorPrompt } from "./agent";
import { DIM, RESET } from "./color";
import { type GatherContextOptions, gatherContext } from "./context";
import { MODELS } from "./provider";
import type { SelectorOption } from "./selector";
import { selector } from "./selector";
import { agentSpinner, doctorSpinner } from "./spinner";

const MAX_TURNS = 50;

export const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash_execute",
      description: "Execute a bash command and return its stdout and stderr output.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given absolute path.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file to read" },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user_question",
      description:
        "Ask the user a question with multiple-choice options. Use this BEFORE running any command that modifies state.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question to ask, including context and numbered steps",
          },
          header: { type: "string", description: "Short header for the question" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Option label" },
                description: { type: "string", description: "Option description" },
              },
              required: ["label"],
            },
            description: "Options for the user to choose from",
          },
        },
        required: ["question", "options"],
      },
    },
  },
];

const APPROVAL_LABELS = new Set(["run these steps", "run fix"]);

async function executeBash(command: string): Promise<string> {
  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    let output = "";
    if (stdout.trim()) output += stdout.trim();
    if (stderr.trim()) output += (output ? "\n" : "") + stderr.trim();
    if (!output) output = `(no output, exit code ${exitCode})`;
    return output;
  } catch (err: unknown) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function readFile(filePath: string): Promise<string> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return `Error: File not found: ${filePath}`;
    const text = await file.text();
    // Truncate very large files
    if (text.length > 50_000) {
      return `${text.slice(0, 50_000)}\n... (truncated, ${text.length} total characters)`;
    }
    return text;
  } catch (err: unknown) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function handleAskUserQuestion(input: {
  question: string;
  header?: string;
  options: Array<{ label: string; description?: string }>;
}): Promise<{ answer: string; aborted: boolean; approved: boolean }> {
  process.stdout.write(`\n${input.question}\n\n`);

  const selectorOptions: SelectorOption[] = input.options.map((opt) => ({
    label: opt.label,
    description: opt.description || "",
  }));
  selectorOptions.push({ label: "Something different", description: "Tell me what to do instead" });

  const selection = await selector(selectorOptions);
  const selectionLower = selection.toLowerCase();

  if (selectionLower === "abort") {
    return { answer: "User aborted.", aborted: true, approved: false };
  }

  const approved = APPROVAL_LABELS.has(selectionLower);
  return { answer: selection, aborted: false, approved };
}

export async function runAgentModeOpenAI(
  prompt: string,
  apiKey: string,
  options?: AgentModeOptions,
): Promise<void> {
  const client = new OpenAI({ apiKey });
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

  const systemPrompt = isDoctor
    ? buildDoctorPrompt(context, !!options?.terminalOutput)
    : buildAgentPrompt(context);

  const userPrompt =
    prompt ||
    (isDoctor
      ? options?.terminalOutput
        ? "Look at my recent terminal output. What went wrong? Diagnose the issue and help me fix it."
        : "I don't have terminal scrollback, but look at my shell history and system context. Figure out what went wrong with my last command and help me fix it."
      : "Look at my shell history and system context. Figure out what I'm struggling with and help me fix it.");

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // When true, bash commands are auto-approved until the next ask_user_question
  let bashApproved = false;

  // In doctor mode without scrollback, allow one diagnostic re-run
  let diagnosticRunAllowed = isDoctor && !options?.terminalOutput;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model: MODELS.openai.agent,
        messages,
        tools: TOOLS,
      });
    } catch (err: unknown) {
      if (stopSpinner) {
        stopSpinner();
        stopSpinner = null;
      }
      const errMessage = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\nAgent error: ${errMessage}\n`);
      process.stderr.write(
        `Try running again. If this persists, check your API key or internet connection.\n`,
      );
      return;
    }

    const choice = response.choices[0];
    if (!choice) break;

    const message = choice.message;

    // Add assistant message to history
    messages.push(message);

    if (stopSpinner) {
      stopSpinner();
      stopSpinner = null;
    }

    // Print any text content
    if (message.content) {
      process.stdout.write(`${message.content}\n`);
    }

    // If no tool calls, we're done
    if (!message.tool_calls || message.tool_calls.length === 0) {
      break;
    }

    // Process tool calls
    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;
      const fnName = toolCall.function.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Error: Invalid JSON in function arguments",
        });
        continue;
      }

      if (fnName === "ask_user_question") {
        bashApproved = false;
        const input = args as {
          question: string;
          header?: string;
          options: Array<{ label: string; description?: string }>;
        };
        const result = await handleAskUserQuestion(input);

        if (result.aborted) {
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: "User aborted." });
          return;
        }

        bashApproved = result.approved;
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `User selected: ${result.answer}`,
        });
      } else if (fnName === "bash_execute") {
        const command = args.command as string;

        // Permission check
        if (!bashApproved) {
          if (diagnosticRunAllowed) {
            diagnosticRunAllowed = false;
            const looksDestructive = /\b(rm|sudo|kill|mkfs|dd)\b|>\s|>>/.test(command);
            if (looksDestructive) {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content:
                  "Permission denied. Please propose this command to the user first using ask_user_question before running it.",
              });
              continue;
            }
            // Allow this one diagnostic command
          } else {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content:
                "Permission denied. Please propose this command to the user first using ask_user_question before running it.",
            });
            continue;
          }
        }

        process.stdout.write(`${DIM}  tool: bash — ${command}${RESET}\n`);
        const output = await executeBash(command);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: output });
      } else if (fnName === "read_file") {
        const filePath = args.file_path as string;
        process.stdout.write(`${DIM}  tool: read — ${filePath}${RESET}\n`);
        const content = await readFile(filePath);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content });
      } else {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Unknown tool: ${fnName}`,
        });
      }
    }
  }
}

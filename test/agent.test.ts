import { describe, expect, test } from "bun:test";
import { buildAgentPrompt, buildDoctorPrompt } from "../src/agent";

const SAMPLE_CONTEXT = `## System
OS: darwin
Arch: arm64
Shell: /bin/zsh
CWD: /Users/test/project

## Git
Branch: main
Working tree clean`;

describe("buildAgentPrompt", () => {
  test("includes the system context", () => {
    const prompt = buildAgentPrompt(SAMPLE_CONTEXT);
    expect(prompt).toInclude(SAMPLE_CONTEXT);
  });

  test("includes devops debugging agent instructions", () => {
    const prompt = buildAgentPrompt(SAMPLE_CONTEXT);
    expect(prompt).toInclude("devops debugging agent");
  });

  test("includes AskUserQuestion instruction", () => {
    const prompt = buildAgentPrompt(SAMPLE_CONTEXT);
    expect(prompt).toInclude("AskUserQuestion");
  });

  test("includes approval options", () => {
    const prompt = buildAgentPrompt(SAMPLE_CONTEXT);
    expect(prompt).toInclude("Run these steps");
    expect(prompt).toInclude("Skip");
    expect(prompt).toInclude("Abort");
  });
});

describe("buildDoctorPrompt", () => {
  test("includes the system context", () => {
    const prompt = buildDoctorPrompt(SAMPLE_CONTEXT, true);
    expect(prompt).toInclude(SAMPLE_CONTEXT);
  });

  test("includes terminal doctor instruction", () => {
    const prompt = buildDoctorPrompt(SAMPLE_CONTEXT, true);
    expect(prompt).toInclude("terminal doctor");
  });

  test("omits re-run instruction when terminal output is available", () => {
    const prompt = buildDoctorPrompt(SAMPLE_CONTEXT, true);
    expect(prompt).not.toInclude("No terminal scrollback is available");
  });

  test("includes re-run instruction when terminal output is NOT available", () => {
    const prompt = buildDoctorPrompt(SAMPLE_CONTEXT, false);
    expect(prompt).toInclude("No terminal scrollback is available");
  });

  test("includes fix approval options", () => {
    const prompt = buildDoctorPrompt(SAMPLE_CONTEXT, true);
    expect(prompt).toInclude("Run fix");
    expect(prompt).toInclude("Skip");
    expect(prompt).toInclude("Abort");
  });
});

describe("OpenAI agent tool definitions", async () => {
  // Dynamically import to check the TOOLS array is well-formed
  // We read the file and check structure since TOOLS isn't exported
  const source = await Bun.file("src/agent-openai.ts").text();

  test("defines bash_execute tool", () => {
    expect(source).toInclude('"bash_execute"');
  });

  test("defines read_file tool", () => {
    expect(source).toInclude('"read_file"');
  });

  test("defines ask_user_question tool", () => {
    expect(source).toInclude('"ask_user_question"');
  });

  test("tools are typed as ChatCompletionTool", () => {
    expect(source).toInclude("ChatCompletionTool");
  });
});

import { expect, test } from "bun:test"
import { runCli } from "../src/cli"

test("top-level help includes commands and shared options", async () => {
  const stdout: string[] = []
  const stderr: string[] = []
  const code = await runCli(["--help"], {
    collectInput: async () => {
      throw new Error("collectInput should not run for help")
    },
    analyze: async () => {
      throw new Error("model should not run for help")
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: (text) => stderr.push(text),
  })

  expect(code).toBe(0)
  expect(stderr).toEqual([])
  expect(stdout.join("")).toContain("Usage: rebot [options] [command]")
  expect(stdout.join("")).toContain("describe")
  expect(stdout.join("")).toContain("review")
  expect(stdout.join("")).toContain("--diff-file <path>")
  expect(stdout.join("")).toContain("--pr <number>")
  expect(stdout.join("")).toContain("--base <ref>")
})

test("command help includes command description and shared options", async () => {
  const stdout: string[] = []
  const code = await runCli(["review", "--help"], {
    collectInput: async () => {
      throw new Error("collectInput should not run for command help")
    },
    analyze: async () => {
      throw new Error("model should not run for command help")
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(stdout.join("")).toContain("Usage: rebot review [options]")
  expect(stdout.join("")).toContain("produce review findings")
  expect(stdout.join("")).toContain("--diff-file <path>")
  expect(stdout.join("")).toContain("--pr <number>")
  expect(stdout.join("")).toContain("--base <ref>")
})

test("version outputs package version", async () => {
  const stdout: string[] = []
  const code = await runCli(["--version"], {
    collectInput: async () => {
      throw new Error("collectInput should not run for version")
    },
    analyze: async () => {
      throw new Error("model should not run for version")
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(stdout.join("").trim()).toBe("0.1.0")
})

test("runCli orchestrates review with PR number", async () => {
  const writes: string[] = []
  const seenOptions: unknown[] = []
  const seenCommands: string[] = []
  const code = await runCli(["review", "--pr", "123"], {
    collectInput: async (options) => {
      seenOptions.push(options)
      return { command: options.command, source: "github-pr", diff: "diff" }
    },
    analyze: async (command) => {
      seenCommands.push(command)
      return "# Review Findings\n\nNo findings."
    },
    writeStdout: (text) => writes.push(text),
    writeStderr: (text) => writes.push(`ERR:${text}`),
  })

  expect(code).toBe(0)
  expect(seenOptions).toEqual([{ command: "review", pr: 123, context: true }])
  expect(seenCommands).toEqual(["review"])
  expect(writes).toEqual(["# Review Findings\n\nNo findings.\n"])
})

test("runCli forwards --model to analyze and enables context by default", async () => {
  const seen: Array<{ model?: string; context?: boolean } | undefined> = []
  const code = await runCli(["review", "--pr", "1", "--model", "gpt-5.4"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    analyze: async (_command, _prompt, options) => {
      seen.push(options)
      return "ok"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(seen).toEqual([{ model: "gpt-5.4", context: true }])
})

test("runCli omits model when --model is not provided", async () => {
  const seen: Array<{ model?: string; context?: boolean } | undefined> = []
  const code = await runCli(["review", "--pr", "1"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    analyze: async (_command, _prompt, options) => {
      seen.push(options)
      return "ok"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(seen).toEqual([{ context: true }])
})

test("runCli disables context with --no-context", async () => {
  const seen: Array<{ model?: string; context?: boolean } | undefined> = []
  const code = await runCli(["review", "--pr", "1", "--no-context"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    analyze: async (_command, _prompt, options) => {
      seen.push(options)
      return "ok"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(seen).toEqual([{ context: false }])
})

test("runCli applies config defaults for model, context, and guardrails", async () => {
  let seen: unknown
  const code = await runCli(["review", "--pr", "1"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    loadConfig: async () => ({
      model: "go/deepseek-v4-pro",
      context: false,
      guardrails: { maxSteps: 3, timeoutMs: 1000, maxOutputTokens: 500 },
    }),
    analyze: async (_command, _prompt, options) => {
      seen = options
      return "x"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(seen).toEqual({
    model: "go/deepseek-v4-pro",
    context: false,
    maxSteps: 3,
    timeoutMs: 1000,
    maxOutputTokens: 500,
  })
})

test("runCli lets CLI flags override config", async () => {
  let seen: unknown
  const code = await runCli(["review", "--pr", "1", "--model", "gpt-5.4", "--no-context"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    loadConfig: async () => ({ model: "go/deepseek-v4-pro", context: true }),
    analyze: async (_command, _prompt, options) => {
      seen = options
      return "x"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(seen).toEqual({ model: "gpt-5.4", context: false })
})

test("runCli runs ask with a question and forwards options", async () => {
  const seen: { prompt?: string; options?: { model?: string; context?: boolean } | undefined } = {}
  const writes: string[] = []
  const code = await runCli(["ask", "why is this safe?", "--pr", "1"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    ask: async (prompt, options) => {
      seen.prompt = prompt
      seen.options = options
      return "answer text"
    },
    writeStdout: (text) => writes.push(text),
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(seen.prompt).toContain("why is this safe?")
  expect(seen.options).toEqual({ context: true })
  expect(writes.join("")).toContain("answer text")
})

test("unknown options fail without invoking the model", async () => {
  const stderr: string[] = []
  const code = await runCli(["review", "--bogus"], {
    collectInput: async () => {
      throw new Error("collectInput should not run for invalid options")
    },
    analyze: async () => {
      throw new Error("model should not run for invalid options")
    },
    writeStdout: () => undefined,
    writeStderr: (text) => stderr.push(text),
  })

  expect(code).toBe(1)
  expect(stderr.join("")).toContain("unknown option")
})

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

test("runCli passes json format to analyze with --json", async () => {
  let seen: unknown
  await runCli(["review", "--pr", "1", "--json"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    analyze: async (_command, _prompt, options) => {
      seen = options
      return '{"findings":[]}'
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect((seen as { format?: string }).format).toBe("json")
})

test("runCli writes output to a file with --output", async () => {
  const files: Array<{ path: string; content: string }> = []
  const stdout: string[] = []
  const code = await runCli(["review", "--pr", "1", "--output", "out.md"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    analyze: async () => "# Review Findings\n\nNo findings.",
    writeFile: async (path, content) => {
      files.push({ path, content })
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(files).toHaveLength(1)
  expect(files[0]?.path).toBe("out.md")
  expect(files[0]?.content).toContain("# Review Findings")
  expect(stdout).toEqual([])
})

test("runCli wraps ask output as JSON with --json", async () => {
  const stdout: string[] = []
  await runCli(["ask", "why?", "--pr", "1", "--json"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    ask: async () => "because reasons",
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => undefined,
  })

  const parsed = JSON.parse(stdout.join(""))
  expect(parsed.answer).toBe("because reasons")
})

test("runCli posts a summary PR comment with --comment", async () => {
  const posted: Array<{ pr: number; command: string; body: string }> = []
  const reviews: Array<{ pr: number; comments: unknown[] }> = []
  const stdout: string[] = []
  const code = await runCli(["review", "--pr", "7", "--comment"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    analyze: async (_command, _prompt, options) => {
      expect(options?.format).toBe("json")
      return '{"findings":[]}'
    },
    postComment: async (opts) => {
      posted.push(opts)
      return { action: "created", id: 1, url: "https://x/1" }
    },
    postReview: async (opts) => {
      reviews.push(opts)
      return { count: opts.comments.length }
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(posted).toHaveLength(1)
  expect(posted[0]?.pr).toBe(7)
  expect(posted[0]?.command).toBe("review")
  expect(posted[0]?.body).toContain("# Review Findings")
  expect(reviews).toEqual([])
  expect(stdout.join("")).toContain("PR #7")
  expect(stdout.join("")).toContain("created")
})

test("runCli posts inline review comments for findings on diff lines", async () => {
  const reviews: Array<{ pr: number; comments: Array<{ path: string; line: number }> }> = []
  const diff = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n+const a = 1\n+const b = 2\n"
  const findingJson = JSON.stringify({
    findings: [{ title: "bug", severity: "high", category: "correctness", file: "src/a.ts", startLine: 2, description: "d" }],
  })
  const code = await runCli(["review", "--pr", "7", "--comment"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff }),
    analyze: async () => findingJson,
    postComment: async () => ({ action: "created", id: 1 }),
    postReview: async (opts) => {
      reviews.push(opts)
      return { count: opts.comments.length }
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(reviews).toHaveLength(1)
  expect(reviews[0]?.comments).toHaveLength(1)
  expect(reviews[0]?.comments[0]?.path).toBe("src/a.ts")
  expect(reviews[0]?.comments[0]?.line).toBe(2)
})

test("runCli rejects --comment without --pr", async () => {
  const stderr: string[] = []
  let posted = false
  const code = await runCli(["review", "--diff-file", "x.patch", "--comment"], {
    collectInput: async (options) => ({ command: options.command, source: "diff-file", diff: "diff" }),
    analyze: async () => "out",
    postComment: async () => {
      posted = true
      return { action: "created", id: 1 }
    },
    writeStdout: () => undefined,
    writeStderr: (text) => stderr.push(text),
  })

  expect(code).toBe(1)
  expect(posted).toBe(false)
  expect(stderr.join("")).toContain("--pr")
})

test("runCli compresses an oversized diff and notes omissions", async () => {
  let prompt = ""
  const lines = Array.from({ length: 30 }, (_, i) => `+line ${i}`).join("\n")
  const bigDiff =
    `diff --git a/src/keep.ts b/src/keep.ts\n--- a/src/keep.ts\n+++ b/src/keep.ts\n@@ -0,0 +1,30 @@\n${lines}\n` +
    `diff --git a/bun.lock b/bun.lock\n--- a/bun.lock\n+++ b/bun.lock\n@@ -0,0 +1,30 @@\n${lines}\n`

  await runCli(["review", "--pr", "1"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: bigDiff }),
    loadConfig: async () => ({ maxDiffTokens: 20 }),
    analyze: async (_command, p) => {
      prompt = p
      return "x"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(prompt).toContain("Omitted files")
  expect(prompt).toContain("bun.lock")
})

test("runCli leaves a within-budget diff untouched", async () => {
  let prompt = ""
  await runCli(["review", "--pr", "1"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "small diff" }),
    loadConfig: async () => ({}),
    analyze: async (_command, p) => {
      prompt = p
      return "x"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(prompt).not.toContain("Omitted files")
})

test("runCli enables micro-optimizations with --micro-opt", async () => {
  let prompt = ""
  await runCli(["review", "--pr", "1", "--micro-opt"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    loadConfig: async () => ({}),
    analyze: async (_command, p) => {
      prompt = p
      return "x"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(prompt.toLowerCase()).toContain("micro-optimization")
})

test("runCli enables micro-optimizations from config", async () => {
  let prompt = ""
  await runCli(["review", "--pr", "1"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    loadConfig: async () => ({ microOptimizations: true }),
    analyze: async (_command, p) => {
      prompt = p
      return "x"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(prompt.toLowerCase()).toContain("micro-optimization")
})

test("micro-optimizations are off by default", async () => {
  let prompt = ""
  await runCli(["review", "--pr", "1"], {
    collectInput: async (options) => ({ command: options.command, source: "github-pr", diff: "diff" }),
    loadConfig: async () => ({}),
    analyze: async (_command, p) => {
      prompt = p
      return "x"
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  })

  expect(prompt.toLowerCase()).not.toContain("micro-optimization")
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

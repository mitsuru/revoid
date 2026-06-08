import { expect, test } from "bun:test"
import type { ToolSet } from "ai"
import { analyze } from "../src/analyze"

test("analyze renders a review result to Markdown via the fallback path", async () => {
  const reviewJson = JSON.stringify({
    summary: "One issue.",
    findings: [
      {
        title: "Subtraction bug",
        severity: "critical",
        category: "correctness",
        file: "x.ts",
        startLine: 1,
        description: "returns a - b",
        suggestion: "use a + b",
      },
    ],
  })

  const md = await analyze("review", "review this diff", {
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("native unsupported")
    },
    generateText: async () => ({ text: reviewJson }),
  })

  expect(md).toContain("# Review Findings")
  expect(md).toContain("Subtraction bug")
  expect(md).toContain("x.ts:1")
  expect(md).toContain("use a + b")
})

test("analyze uses the schema for the given command", async () => {
  const describeJson = JSON.stringify({
    summary: "Adds a helper.",
    changedAreas: ["x.ts"],
    notableDetails: [],
    suggestedTestFocus: [],
  })

  const md = await analyze("describe", "describe this diff", {
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("native unsupported")
    },
    generateText: async () => ({ text: describeJson }),
  })

  expect(md).toContain("# Description")
  expect(md).toContain("Adds a helper.")
})

test("analyze builds repository context tools from cwd by default", async () => {
  let passedTools: ToolSet | undefined

  await analyze("review", "review this", {
    cwd: process.cwd(),
    resolveModel: async () => ({}) as never,
    generateText: async ({ tools }) => {
      passedTools = tools
      return { text: '{"findings": []}' }
    },
  })

  expect(passedTools).toBeDefined()
  expect(Object.keys(passedTools ?? {}).sort()).toEqual(["grep", "read_file"])
})

test("analyze adds cross-cutting context guidance to the prompt when tools are on", async () => {
  let seenPrompt = ""

  await analyze("review", "review this diff", {
    cwd: process.cwd(),
    resolveModel: async () => ({}) as never,
    generateText: async ({ prompt }) => {
      seenPrompt = prompt
      return { text: '{"findings": []}' }
    },
  })

  expect(seenPrompt).toContain("review this diff")
  expect(seenPrompt).toContain("read_file")
  expect(seenPrompt).toContain("grep")
  expect(seenPrompt.toLowerCase()).toContain("beyond the diff")
})

test("analyze omits context guidance when context is disabled", async () => {
  let seenPrompt = ""

  await analyze("review", "review this diff", {
    context: false,
    cwd: process.cwd(),
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("unsupported")
    },
    generateText: async ({ prompt }) => {
      seenPrompt = prompt
      return { text: '{"findings": []}' }
    },
  })

  expect(seenPrompt.toLowerCase()).not.toContain("beyond the diff")
})

test("analyze omits context tools when context is disabled", async () => {
  let passedTools: ToolSet | undefined = {} as ToolSet

  await analyze("review", "review this", {
    context: false,
    cwd: process.cwd(),
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("unsupported")
    },
    generateText: async ({ tools }) => {
      passedTools = tools
      return { text: '{"findings": []}' }
    },
  })

  expect(passedTools).toBeUndefined()
})

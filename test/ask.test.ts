import { expect, test } from "bun:test"
import type { ToolSet } from "ai"
import { ask } from "../src/ask"

test("ask returns the model's text answer", async () => {
  const answer = await ask("why is this safe?", {
    cwd: process.cwd(),
    resolveModel: async () => ({}) as never,
    generate: async () => ({ text: "Because the input is validated." }),
  })

  expect(answer).toBe("Because the input is validated.")
})

test("ask gives the model repository context tools by default", async () => {
  let passedTools: ToolSet | undefined

  await ask("q", {
    cwd: process.cwd(),
    resolveModel: async () => ({}) as never,
    generate: async ({ tools }) => {
      passedTools = tools
      return { text: "a" }
    },
  })

  expect(Object.keys(passedTools ?? {}).sort()).toEqual(["grep", "read_file"])
})

test("ask omits tools when context is disabled", async () => {
  let passedTools: ToolSet | undefined = {} as ToolSet

  await ask("q", {
    context: false,
    cwd: process.cwd(),
    resolveModel: async () => ({}) as never,
    generate: async ({ tools }) => {
      passedTools = tools
      return { text: "a" }
    },
  })

  expect(passedTools).toBeUndefined()
})

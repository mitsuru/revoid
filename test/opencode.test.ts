import { expect, test } from "bun:test"
import { runOpencodePrompt } from "../src/opencode"

test("runOpencodePrompt creates a session and returns assistant text", async () => {
  const calls: string[] = []
  const result = await runOpencodePrompt("hello", {
    create: async () => ({
      client: {
        session: {
          create: async ({ body }: { body: { title: string } }) => {
            calls.push(`create:${body.title}`)
            return { data: { id: "session-1" } }
          },
          prompt: async ({ path, body }: { path: { id: string }; body: { parts: { type: string; text: string }[] } }) => {
            calls.push(`prompt:${path.id}:${body.parts[0]?.text}`)
            return { data: { parts: [{ type: "text", text: "assistant output" }] } }
          },
        },
      },
      server: { close: () => calls.push("close") },
    }),
  })

  expect(result.markdown).toBe("assistant output")
  expect(calls).toEqual(["create:rebot", "prompt:session-1:hello", "close"])
})

test("runOpencodePrompt surfaces session creation SDK errors and closes the server", async () => {
  const calls: string[] = []

  await expect(
    runOpencodePrompt("hello", {
      create: async () => ({
        client: {
          session: {
            create: async () => ({
              data: undefined,
              error: { name: "BadRequestError", data: { message: "create failed" } },
            }),
            prompt: async () => ({ data: { parts: [] } }),
          },
        },
        server: { close: () => calls.push("close") },
      }),
    }),
  ).rejects.toThrow(/Failed to create opencode session.*create failed/)

  expect(calls).toEqual(["close"])
})

test("runOpencodePrompt surfaces prompt SDK errors and closes the server", async () => {
  const calls: string[] = []

  await expect(
    runOpencodePrompt("hello", {
      create: async () => ({
        client: {
          session: {
            create: async () => ({ data: { id: "session-1" } }),
            prompt: async () => ({
              data: undefined,
              error: { name: "BadRequestError", data: { message: "prompt failed" } },
            }),
          },
        },
        server: { close: () => calls.push("close") },
      }),
    }),
  ).rejects.toThrow(/Failed to run opencode prompt.*prompt failed/)

  expect(calls).toEqual(["close"])
})

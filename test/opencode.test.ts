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

import { createOpencode } from "@opencode-ai/sdk"
import type { RunResult } from "./types"

interface TextPart {
  type: string
  text?: string
}

interface PromptResponse {
  data?: {
    parts?: TextPart[]
  }
}

interface SessionClient {
  session: {
    create(input: { body: { title: string } }): Promise<{ data: { id: string } }>
    prompt(input: { path: { id: string }; body: { parts: { type: "text"; text: string }[] } }): Promise<PromptResponse>
  }
}

interface OpencodeInstance {
  client: SessionClient
  server?: { close: () => void }
}

interface RunDeps {
  create?: () => Promise<OpencodeInstance>
}

export async function runOpencodePrompt(prompt: string, deps: RunDeps = {}): Promise<RunResult> {
  const create = deps.create ?? (() => createOpencode() as Promise<OpencodeInstance>)
  const opencode = await create()

  try {
    const session = await opencode.client.session.create({ body: { title: "rebot" } })
    const response = await opencode.client.session.prompt({
      path: { id: session.data.id },
      body: { parts: [{ type: "text", text: prompt }] },
    })

    return { markdown: extractText(response) }
  } finally {
    opencode.server?.close()
  }
}

function extractText(response: PromptResponse): string {
  return (response.data?.parts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
}

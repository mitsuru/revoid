import { createOpencode } from "@opencode-ai/sdk"
import type { RunResult } from "./types"

interface TextPart {
  type: string
  text?: string
}

interface PromptResponse {
  data?: {
    parts?: TextPart[]
  } | undefined
  error?: SdkError
}

interface CreateSessionResponse {
  data?: {
    id?: string
  } | undefined
  error?: SdkError
}

interface SdkError {
  message?: string
  data?: {
    message?: string
  }
}

interface SessionClient {
  session: {
    create(input: { body: { title: string } }): Promise<CreateSessionResponse>
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
    if (!session.data?.id) {
      throw new Error(withSdkError("Failed to create opencode session", session.error))
    }

    const response = await opencode.client.session.prompt({
      path: { id: session.data.id },
      body: { parts: [{ type: "text", text: prompt }] },
    })
    if (response.error) {
      throw new Error(withSdkError("Failed to run opencode prompt", response.error))
    }

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

function withSdkError(message: string, error?: SdkError): string {
  const detail = typeof error?.message === "string" ? error.message : error?.data?.message
  return typeof detail === "string" ? `${message}: ${detail}` : message
}

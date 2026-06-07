import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

export const ZEN_BASE_URL = "https://opencode.ai/zen/v1"
export const ZEN_API_KEY_ENV = "REBOT_ZEN_API_KEY"

const DEFAULT_AUTH_PATH = join(homedir(), ".local", "share", "opencode", "auth.json")

interface ResolveKeyDeps {
  env?: Record<string, string | undefined>
  readAuthFile?: () => Promise<string>
}

export async function resolveZenApiKey(deps: ResolveKeyDeps = {}): Promise<string> {
  const env = deps.env ?? process.env
  const readAuthFile = deps.readAuthFile ?? (() => readFile(DEFAULT_AUTH_PATH, "utf8"))

  const fromEnv = env[ZEN_API_KEY_ENV]?.trim()
  if (fromEnv) return fromEnv

  const fromAuth = await readOpencodeGoKey(readAuthFile)
  if (fromAuth) return fromAuth

  throw new Error(
    `No opencode zen API key found. Set ${ZEN_API_KEY_ENV} or run 'opencode auth login' to store an 'opencode-go' key.`,
  )
}

async function readOpencodeGoKey(readAuthFile: () => Promise<string>): Promise<string | undefined> {
  let raw: string
  try {
    raw = await readAuthFile()
  } catch {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as { "opencode-go"?: { key?: string } }
    return parsed["opencode-go"]?.key?.trim() || undefined
  } catch {
    return undefined
  }
}

export function createZenProvider(options: { apiKey: string; baseURL?: string }) {
  return createOpenAICompatible({
    name: "zen",
    baseURL: options.baseURL ?? ZEN_BASE_URL,
    apiKey: options.apiKey,
  })
}

export async function getZenModel(modelId: string, deps: ResolveKeyDeps = {}) {
  const apiKey = await resolveZenApiKey(deps)
  return createZenProvider({ apiKey })(modelId)
}

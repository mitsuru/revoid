import { describe, expect, test } from "bun:test"
import {
  ZEN_API_KEY_ENV,
  ZEN_BASE_URL,
  createZenProvider,
  getZenModel,
  resolveZenApiKey,
} from "../src/provider"

const authJson = (key: string) =>
  JSON.stringify({ openai: { type: "oauth" }, "opencode-go": { type: "api", key } })

describe("ZEN_BASE_URL", () => {
  test("points at the opencode zen v1 gateway", () => {
    expect(ZEN_BASE_URL).toBe("https://opencode.ai/zen/v1")
  })
})

describe("resolveZenApiKey", () => {
  test("prefers the environment variable when set", async () => {
    const key = await resolveZenApiKey({
      env: { [ZEN_API_KEY_ENV]: "env-key" },
      readAuthFile: async () => authJson("auth-key"),
    })

    expect(key).toBe("env-key")
  })

  test("falls back to the opencode-go key from auth.json", async () => {
    const key = await resolveZenApiKey({
      env: {},
      readAuthFile: async () => authJson("auth-key"),
    })

    expect(key).toBe("auth-key")
  })

  test("throws a helpful error when no key is available", async () => {
    await expect(
      resolveZenApiKey({
        env: {},
        readAuthFile: async () => {
          throw new Error("ENOENT")
        },
      }),
    ).rejects.toThrow(/opencode-go/)
  })
})

describe("createZenProvider / getZenModel", () => {
  test("builds a chat model with the requested model id", () => {
    const provider = createZenProvider({ apiKey: "k" })
    const model = provider("claude-haiku-4-5")

    expect(model.modelId).toBe("claude-haiku-4-5")
  })

  test("getZenModel resolves the key and returns the requested model", async () => {
    const model = await getZenModel("deepseek-v4-flash-free", {
      env: { [ZEN_API_KEY_ENV]: "k" },
      readAuthFile: async () => authJson("auth-key"),
    })

    expect(model.modelId).toBe("deepseek-v4-flash-free")
  })
})

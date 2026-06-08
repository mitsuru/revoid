import { describe, expect, test } from "bun:test"
import { loadConfig } from "../src/config"

describe("loadConfig", () => {
  test("parses and validates a .rebot.toml", async () => {
    const cfg = await loadConfig({
      readConfigFile: async () =>
        'model = "go/deepseek-v4-pro"\ncontext = false\n[guardrails]\nmaxSteps = 5\n',
    })

    expect(cfg.model).toBe("go/deepseek-v4-pro")
    expect(cfg.context).toBe(false)
    expect(cfg.guardrails?.maxSteps).toBe(5)
  })

  test("parses maxDiffTokens", async () => {
    const cfg = await loadConfig({ readConfigFile: async () => "maxDiffTokens = 12000\n" })
    expect(cfg.maxDiffTokens).toBe(12000)
  })

  test("returns an empty config when the file is absent", async () => {
    const cfg = await loadConfig({ readConfigFile: async () => undefined })
    expect(cfg).toEqual({})
  })

  test("throws on a schema-invalid value", async () => {
    await expect(
      loadConfig({ readConfigFile: async () => 'context = "yes"\n' }),
    ).rejects.toThrow(/rebot\.toml/)
  })

  test("throws on a negative guardrail", async () => {
    await expect(
      loadConfig({ readConfigFile: async () => "[guardrails]\nmaxSteps = -1\n" }),
    ).rejects.toThrow(/rebot\.toml/)
  })

  test("throws on malformed TOML", async () => {
    await expect(
      loadConfig({ readConfigFile: async () => "model = = =\n" }),
    ).rejects.toThrow(/TOML/)
  })
})

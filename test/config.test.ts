import { describe, expect, test } from "bun:test"
import { loadConfig } from "../src/config"

describe("loadConfig", () => {
  test("parses and validates a .revoid.toml", async () => {
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

  test("parses microOptimizations", async () => {
    const cfg = await loadConfig({ readConfigFile: async () => "microOptimizations = true\n" })
    expect(cfg.microOptimizations).toBe(true)
  })

  test("parses language", async () => {
    const cfg = await loadConfig({ readConfigFile: async () => 'language = "Japanese"\n' })
    expect(cfg.language).toBe("Japanese")
  })

  test("parses path-based rules", async () => {
    const cfg = await loadConfig({
      readConfigFile: async () =>
        '[[rules]]\npath = "src/api/**"\nguidance = "check auth"\nname = "api"\n',
    })
    expect(cfg.rules).toHaveLength(1)
    expect(cfg.rules?.[0]?.path).toBe("src/api/**")
    expect(cfg.rules?.[0]?.guidance).toBe("check auth")
  })

  test("rejects a rule without guidance", async () => {
    await expect(
      loadConfig({ readConfigFile: async () => '[[rules]]\npath = "src/**"\n' }),
    ).rejects.toThrow(/revoid\.toml/)
  })

  test("returns an empty config when the file is absent", async () => {
    const cfg = await loadConfig({ readConfigFile: async () => undefined })
    expect(cfg).toEqual({})
  })

  test("throws on a schema-invalid value", async () => {
    await expect(
      loadConfig({ readConfigFile: async () => 'context = "yes"\n' }),
    ).rejects.toThrow(/revoid\.toml/)
  })

  test("throws on a negative guardrail", async () => {
    await expect(
      loadConfig({ readConfigFile: async () => "[guardrails]\nmaxSteps = -1\n" }),
    ).rejects.toThrow(/revoid\.toml/)
  })

  test("throws on malformed TOML", async () => {
    await expect(
      loadConfig({ readConfigFile: async () => "model = = =\n" }),
    ).rejects.toThrow(/TOML/)
  })
})

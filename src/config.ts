import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parse as parseTomlText } from "smol-toml"
import { z } from "zod"

export const CONFIG_FILENAME = ".revoid.toml"

export const ruleSchema = z.object({
  path: z.string(),
  guidance: z.string(),
  name: z.string().optional(),
})

export type RevoidRule = z.infer<typeof ruleSchema>

export const configSchema = z.object({
  model: z.string().optional(),
  language: z.string().optional(),
  context: z.boolean().optional(),
  maxDiffTokens: z.number().int().positive().optional(),
  microOptimizations: z.boolean().optional(),
  rules: z.array(ruleSchema).optional(),
  guardrails: z
    .object({
      maxSteps: z.number().int().positive().optional(),
      timeoutMs: z.number().int().positive().optional(),
      maxOutputTokens: z.number().int().positive().optional(),
    })
    .optional(),
})

export type RevoidConfig = z.infer<typeof configSchema>

interface LoadConfigDeps {
  cwd?: string
  /** Returns the file contents, or undefined when the file does not exist. */
  readConfigFile?: (path: string) => Promise<string | undefined>
  parseToml?: (text: string) => unknown
}

export async function loadConfig(deps: LoadConfigDeps = {}): Promise<RevoidConfig> {
  const cwd = deps.cwd ?? process.cwd()
  const read = deps.readConfigFile ?? defaultRead
  const parseToml = deps.parseToml ?? ((text: string) => parseTomlText(text))

  const text = await read(join(cwd, CONFIG_FILENAME))
  if (text === undefined) return {}

  let raw: unknown
  try {
    raw = parseToml(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid TOML in ${CONFIG_FILENAME}: ${detail}`)
  }

  const result = configSchema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    throw new Error(`Invalid ${CONFIG_FILENAME}: ${detail}`)
  }
  return result.data
}

async function defaultRead(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return undefined
  }
}

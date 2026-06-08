import {
  generateObject,
  generateText,
  stepCountIs,
  type LanguageModel,
  type StopCondition,
  type ToolSet,
} from "ai"
import { z, type ZodType } from "zod"
import { getModel } from "./provider"
import type { RunResult } from "./types"

export const DEFAULT_MAX_STEPS = 8
export const DEFAULT_TIMEOUT_MS = 120_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192

// Go subscription model (no zen balance required). Override with --model or REBOT_MODEL.
export const DEFAULT_MODEL = "go/deepseek-v4-pro"
export const MODEL_ENV = "REBOT_MODEL"

type GenerateFn = (options: {
  model: LanguageModel
  prompt: string
  tools?: ToolSet
  stopWhen?: StopCondition<ToolSet>
  abortSignal?: AbortSignal
  maxOutputTokens?: number
}) => Promise<{ text: string }>
type GenerateObjectFn = (options: {
  model: LanguageModel
  prompt: string
  schema: ZodType
  abortSignal?: AbortSignal
  maxOutputTokens?: number
}) => Promise<{ object: unknown }>
type ResolveModelFn = (
  modelId: string,
  options?: { structuredOutputs?: boolean },
) => Promise<LanguageModel>

interface ModelDeps {
  model?: string
  env?: Record<string, string | undefined>
  resolveModel?: ResolveModelFn
}

export interface RunModelDeps extends ModelDeps {
  generate?: GenerateFn
  tools?: ToolSet
  maxSteps?: number
  timeoutMs?: number
  maxOutputTokens?: number
}

export interface RunModelObjectDeps extends ModelDeps {
  generateObject?: GenerateObjectFn
  generateText?: GenerateFn
  tools?: ToolSet
  maxSteps?: number
  timeoutMs?: number
  maxOutputTokens?: number
}

function resolveModelId(deps: ModelDeps): string {
  const envModel = (deps.env ?? process.env)[MODEL_ENV]?.trim()
  return deps.model ?? (envModel || DEFAULT_MODEL)
}

function withContext(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`Failed to run model prompt: ${message}`)
}

export async function runModel(prompt: string, deps: RunModelDeps = {}): Promise<RunResult> {
  const resolveModel = deps.resolveModel ?? ((id: string) => getModel(id))
  const generate = deps.generate ?? ((options) => generateText(options))
  const limits = {
    abortSignal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    maxOutputTokens: deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  }
  const toolOptions = deps.tools
    ? { tools: deps.tools, stopWhen: stepCountIs(deps.maxSteps ?? DEFAULT_MAX_STEPS) }
    : {}

  try {
    const model = await resolveModel(resolveModelId(deps))
    const result = await generate({ model, prompt, ...limits, ...toolOptions })
    return { markdown: result.text }
  } catch (error) {
    throw withContext(error)
  }
}

/**
 * Produces a schema-validated object. Tries the provider's native structured
 * output first; gateways/models that do not support it (e.g. opencode Go
 * models) fast-fail and we fall back to embedding the JSON Schema in the prompt
 * and validating client-side, with a single repair retry.
 */
export async function runModelObject<T>(
  prompt: string,
  schema: ZodType<T>,
  deps: RunModelObjectDeps = {},
): Promise<T> {
  const modelId = resolveModelId(deps)
  const resolveModel = deps.resolveModel ?? ((id, options) => getModel(id, {}, options))
  const genObject = deps.generateObject ?? ((options) => generateObject(options))
  const genText = deps.generateText ?? ((options) => generateText(options))

  // Guardrails: bound total wall-clock time and per-call output tokens.
  const abortSignal = AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const maxOutputTokens = deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
  const limits = { abortSignal, maxOutputTokens }

  // The native structured-output path cannot run a tool loop, so skip it when
  // tools are requested (the model needs to gather context before answering).
  if (!deps.tools) {
    try {
      const model = await resolveModel(modelId, { structuredOutputs: true })
      const { object } = await genObject({ model, prompt, schema, ...limits })
      return schema.parse(object)
    } catch {
      // Native structured output unavailable or non-conforming; fall back below.
    }
  }

  try {
    const model = await resolveModel(modelId)
    const schemaPrompt = buildSchemaPrompt(prompt, schema)
    const toolOptions = deps.tools
      ? { tools: deps.tools, stopWhen: stepCountIs(deps.maxSteps ?? DEFAULT_MAX_STEPS) }
      : {}

    let text = (await genText({ model, prompt: schemaPrompt, ...limits, ...toolOptions })).text
    let validated = parseSchema(text, schema)

    if (!validated.success) {
      const repairPrompt = `${schemaPrompt}\n\nYour previous response was not valid (${validated.error}). Return ONLY corrected JSON.`
      text = (await genText({ model, prompt: repairPrompt, ...limits })).text
      validated = parseSchema(text, schema)
    }

    if (!validated.success) {
      throw new Error(`response did not match schema: ${validated.error}`)
    }
    return validated.data
  } catch (error) {
    throw withContext(error)
  }
}

function buildSchemaPrompt(prompt: string, schema: ZodType): string {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema))
  return `${prompt}\n\nRespond with ONLY a JSON object (no prose, no markdown fences) that conforms to this JSON Schema:\n${jsonSchema}`
}

type ParseResult<T> = { success: true; data: T } | { success: false; error: string }

function parseSchema<T>(text: string, schema: ZodType<T>): ParseResult<T> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch {
    return { success: false, error: "output was not valid JSON" }
  }

  const result = schema.safeParse(json)
  if (result.success) return { success: true, data: result.data }
  return { success: false, error: result.error.issues.map((i) => i.message).join("; ") }
}

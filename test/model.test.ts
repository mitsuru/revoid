import { expect, test } from "bun:test"
import { z } from "zod"
import { DEFAULT_MODEL, runModel, runModelObject } from "../src/model"

test("runModel returns the generated text as markdown and passes prompt + resolved model", async () => {
  const seen: { id?: string; prompt?: string; model?: unknown } = {}

  const result = await runModel("hello", {
    model: "test-model",
    resolveModel: async (id) => {
      seen.id = id
      return { id } as never
    },
    generate: async ({ model, prompt }) => {
      seen.model = model
      seen.prompt = prompt
      return { text: "assistant output" }
    },
  })

  expect(result.markdown).toBe("assistant output")
  expect(seen.id).toBe("test-model")
  expect(seen.prompt).toBe("hello")
  expect(seen.model).toEqual({ id: "test-model" })
})

test("runModel uses DEFAULT_MODEL when no model is provided", async () => {
  let usedId = ""

  await runModel("hi", {
    resolveModel: async (id) => {
      usedId = id
      return {} as never
    },
    generate: async () => ({ text: "x" }),
  })

  expect(usedId).toBe(DEFAULT_MODEL)
})

test("runModel resolves model id: deps.model > REBOT_MODEL env > DEFAULT_MODEL", async () => {
  const ids: string[] = []
  const resolveModel = async (id: string) => {
    ids.push(id)
    return {} as never
  }
  const generate = async () => ({ text: "x" })

  await runModel("p", { resolveModel, generate, env: { REBOT_MODEL: "env-model" } })
  await runModel("p", { resolveModel, generate, env: {} })
  await runModel("p", { model: "explicit", resolveModel, generate, env: { REBOT_MODEL: "env-model" } })

  expect(ids).toEqual(["env-model", DEFAULT_MODEL, "explicit"])
})

test("runModelObject uses the native generateObject path when it succeeds", async () => {
  const seen: { id?: string; structuredOutputs?: boolean | undefined; schema?: unknown } = {}
  let textCalls = 0
  const schema = z.object({ ok: z.boolean() })

  const obj = await runModelObject("hello", schema, {
    model: "test-model",
    resolveModel: async (id, options) => {
      seen.id = id
      seen.structuredOutputs = options?.structuredOutputs
      return { id } as never
    },
    generateObject: async ({ schema: s }) => {
      seen.schema = s
      return { object: { ok: true } }
    },
    generateText: async () => {
      textCalls++
      return { text: "should not be called" }
    },
  })

  expect(obj).toEqual({ ok: true })
  expect(seen.id).toBe("test-model")
  expect(seen.structuredOutputs).toBe(true)
  expect(seen.schema).toBe(schema)
  expect(textCalls).toBe(0)
})

test("runModelObject falls back to schema-in-prompt when native is unsupported", async () => {
  let textPrompt = ""
  const schema = z.object({ ok: z.boolean() })

  const obj = await runModelObject("review this", schema, {
    model: "go/deepseek-v4-pro",
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("This response_format type is unavailable now")
    },
    generateText: async ({ prompt }) => {
      textPrompt = prompt
      return { text: '```json\n{"ok": true}\n```' }
    },
  })

  expect(obj).toEqual({ ok: true })
  expect(textPrompt).toContain("review this")
  expect(textPrompt).toContain("JSON")
})

test("runModelObject passes tools to the fallback loop and skips the native path", async () => {
  let nativeCalled = false
  let passedTools: unknown
  const tools = { grep: {} } as never

  const obj = await runModelObject("p", z.object({ ok: z.boolean() }), {
    tools,
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      nativeCalled = true
      return { object: {} }
    },
    generateText: async ({ tools: t }) => {
      passedTools = t
      return { text: '{"ok": true}' }
    },
  })

  expect(nativeCalled).toBe(false)
  expect(passedTools).toBe(tools)
  expect(obj).toEqual({ ok: true })
})

test("runModelObject applies time and token guardrails in the fallback path", async () => {
  let seen: { abortSignal?: unknown; maxOutputTokens?: number | undefined } = {}

  await runModelObject("p", z.object({ ok: z.boolean() }), {
    tools: { grep: {} } as never,
    resolveModel: async () => ({}) as never,
    generateText: async ({ abortSignal, maxOutputTokens }) => {
      seen = { abortSignal, maxOutputTokens }
      return { text: '{"ok": true}' }
    },
  })

  expect(seen.abortSignal).toBeInstanceOf(AbortSignal)
  expect(typeof seen.maxOutputTokens).toBe("number")
})

test("runModelObject lets callers override token and step guardrails", async () => {
  let seenMaxTokens = 0

  await runModelObject("p", z.object({ ok: z.boolean() }), {
    tools: { grep: {} } as never,
    maxOutputTokens: 123,
    maxSteps: 2,
    timeoutMs: 5000,
    resolveModel: async () => ({}) as never,
    generateText: async ({ maxOutputTokens }) => {
      seenMaxTokens = maxOutputTokens ?? 0
      return { text: '{"ok": true}' }
    },
  })

  expect(seenMaxTokens).toBe(123)
})

test("runModelObject strips markdown code fences in the fallback path", async () => {
  const obj = await runModelObject("p", z.object({ ok: z.boolean() }), {
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("unsupported")
    },
    generateText: async () => ({ text: '```json\n{"ok": true}\n```' }),
  })

  expect(obj).toEqual({ ok: true })
})

test("runModelObject repairs once when the first fallback response is invalid", async () => {
  const texts = ["not json at all", '{"ok": true}']
  let call = 0

  const obj = await runModelObject("p", z.object({ ok: z.boolean() }), {
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("unsupported")
    },
    generateText: async () => ({ text: texts[call++] as string }),
  })

  expect(obj).toEqual({ ok: true })
  expect(call).toBe(2)
})

test("runModelObject resolves model id via env/default like runModel", async () => {
  let usedId = ""

  await runModelObject("p", z.object({}), {
    resolveModel: async (id) => {
      usedId = id
      return {} as never
    },
    generateObject: async () => ({ object: {} }),
    env: {},
  })

  expect(usedId).toBe(DEFAULT_MODEL)
})

test("runModelObject throws with context when fallback never validates", async () => {
  await expect(
    runModelObject("p", z.object({ ok: z.boolean() }), {
      resolveModel: async () => ({}) as never,
      generateObject: async () => {
        throw new Error("unsupported")
      },
      generateText: async () => ({ text: "still not valid" }),
    }),
  ).rejects.toThrow(/Failed to run model prompt/)
})

test("runModel passes tools and guardrails to generate", async () => {
  let seen: { tools?: unknown; abortSignal?: unknown; maxOutputTokens?: number | undefined } = {}

  await runModel("p", {
    tools: { grep: {} } as never,
    resolveModel: async () => ({}) as never,
    generate: async ({ tools, abortSignal, maxOutputTokens }) => {
      seen = { tools, abortSignal, maxOutputTokens }
      return { text: "hi" }
    },
  })

  expect(seen.tools).toBeDefined()
  expect(seen.abortSignal).toBeInstanceOf(AbortSignal)
  expect(typeof seen.maxOutputTokens).toBe("number")
})

test("runModel surfaces model errors with context", async () => {
  await expect(
    runModel("hi", {
      resolveModel: async () => ({}) as never,
      generate: async () => {
        throw new Error("boom")
      },
    }),
  ).rejects.toThrow(/Failed to run model prompt.*boom/)
})

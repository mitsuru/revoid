#!/usr/bin/env node
import { realpathSync } from "node:fs"
import { mkdir, writeFile as fsWriteFile } from "node:fs/promises"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Command, CommanderError, InvalidArgumentError } from "commander"
import { analyze as defaultAnalyze } from "./analyze"
import { ask as defaultAsk } from "./ask"
import { CONFIG_FILENAME, languageSchema, loadConfig as defaultLoadConfig, type RevoidConfig } from "./config"
import { configReference, configReferenceData } from "./configref"
import {
  buildReviewComments,
  postComment as defaultPostComment,
  postReview as defaultPostReview,
  type PostCommentResult,
  type ReviewComment,
} from "./github"
import { DEFAULT_MAX_DIFF_TOKENS, compressDiff, estimateTokens } from "./diff"
import { collectInput as defaultCollectInput } from "./inputs"
import { DEFAULT_MODEL, MODEL_ENV } from "./model"
import { formatMarkdown } from "./output"
import { buildAskPrompt, buildPrompt } from "./prompts"
import { renderResult } from "./render"
import type { ReviewFinding } from "./schema"
import { type SetupOptions, runSetup as defaultRunSetup } from "./setup"
import type { CliOptions, NormalizedInput, PullRequestMetadata, RevoidCommand } from "./types"

type RunCliInput = Omit<NormalizedInput, "base" | "diffFile" | "pr"> & {
  base?: string | undefined
  diffFile?: string | undefined
  pr?: PullRequestMetadata | undefined
}

interface RunCliDeps {
  collectInput?: (options: CliOptions) => Promise<RunCliInput>
  analyze?: (command: RevoidCommand, prompt: string, options?: RunOptions) => Promise<string>
  ask?: (prompt: string, options?: RunOptions) => Promise<string>
  loadConfig?: () => Promise<RevoidConfig>
  postComment?: (opts: { pr: number; command: string; body: string }) => Promise<PostCommentResult>
  postReview?: (opts: { pr: number; comments: ReviewComment[] }) => Promise<{ count: number }>
  writeStdout?: (text: string) => void
  writeStderr?: (text: string) => void
  writeFile?: (path: string, content: string) => Promise<void>
  runSetup?: (options: SetupOptions) => Promise<unknown>
}

interface RunOptions {
  model?: string
  context?: boolean
  maxSteps?: number
  timeoutMs?: number
  maxOutputTokens?: number
  format?: "markdown" | "json"
}

interface SharedOptions {
  diffFile?: string
  pr?: number
  base?: string
  model?: string
  language?: string
  context?: boolean
  json?: boolean
  output?: string
  comment?: boolean
  microOpt?: boolean
}

function addSharedOptions(command: Command): Command {
  return command
    .option("--diff-file <path>", "read diff from a file")
    .option("--pr <number>", "read diff from a GitHub pull request", parsePositiveInteger)
    .option("--base <ref>", "diff the current worktree against a base ref")
    .option("--model <id>", `model id, optional go/ or zen/ prefix (default: ${DEFAULT_MODEL}; or set ${MODEL_ENV})`)
    .option(
      "--language <lang>",
      "language for the generated prose (e.g. Japanese; default: English)",
      parseLanguage,
    )
    .option("--no-context", "disable repository context tools (read_file/grep)")
    .option("--json", "output raw JSON instead of Markdown")
    .option("--output <file>", "write output to a file instead of stdout")
    .option("--comment", "post the result as a PR comment (requires --pr)")
    .option("--micro-opt", "also suggest micro-optimizations (performance nitpicks)")
}

async function postInlineComments(
  command: RevoidCommand,
  result: unknown,
  diff: string,
  pr: number,
  postReview: (opts: { pr: number; comments: ReviewComment[] }) => Promise<{ count: number }>,
): Promise<string> {
  if (command !== "review" && command !== "all") return ""
  const record = result as { findings?: ReviewFinding[]; review?: { findings?: ReviewFinding[] } }
  const findings = (command === "all" ? record.review?.findings : record.findings) ?? []
  const { comments } = buildReviewComments(findings, diff)
  if (comments.length === 0) return ""
  const posted = await postReview({ pr, comments })
  return ` and ${posted.count} inline comment(s)`
}

function applyDiffBudget(
  input: NormalizedInput,
  maxDiffTokens: number,
): { input: NormalizedInput; note: string } {
  if (estimateTokens(input.diff) <= maxDiffTokens) return { input, note: "" }

  const { diff, omitted } = compressDiff(input.diff, maxDiffTokens)
  const note = omitted.length
    ? `\n\nNote: the diff exceeded the size budget and was reduced. Omitted files (not shown): ${omitted.join(", ")}.\n`
    : ""
  return { input: { ...input, diff }, note }
}

function resolveRunOptions(
  cliOptions: CliOptions,
  config: RevoidConfig,
  env: Record<string, string | undefined>,
): RunOptions {
  const envModel = env[MODEL_ENV]?.trim() || undefined
  const model = cliOptions.model ?? envModel ?? config.model
  const context = cliOptions.context === false ? false : (config.context ?? true)

  const options: RunOptions = { context }
  if (model) options.model = model
  const guardrails = config.guardrails ?? {}
  if (guardrails.maxSteps !== undefined) options.maxSteps = guardrails.maxSteps
  if (guardrails.timeoutMs !== undefined) options.timeoutMs = guardrails.timeoutMs
  if (guardrails.maxOutputTokens !== undefined) options.maxOutputTokens = guardrails.maxOutputTokens
  return options
}

const commands: Array<{ name: RevoidCommand; description: string }> = [
  { name: "describe", description: "produce a pull request description" },
  { name: "review", description: "produce review findings" },
  { name: "improve", description: "produce improvement suggestions" },
  { name: "all", description: "produce a complete pull request analysis" },
  { name: "changelog", description: "produce a changelog entry" },
  { name: "labels", description: "suggest labels for a pull request" },
]

export function createProgram(deps: RunCliDeps = {}): Command {
  const collectInput = deps.collectInput ?? defaultCollectInput
  const analyze = deps.analyze ?? defaultAnalyze
  const ask = deps.ask ?? defaultAsk
  const loadConfig = deps.loadConfig ?? defaultLoadConfig
  const postComment = deps.postComment ?? ((opts) => defaultPostComment(opts))
  const postReview = deps.postReview ?? ((opts) => defaultPostReview(opts))
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text))
  const writeStderr = deps.writeStderr ?? ((text: string) => process.stderr.write(text))
  const runSetup = deps.runSetup ?? ((options: SetupOptions) => defaultRunSetup(options))
  const writeFile =
    deps.writeFile ??
    (async (path: string, content: string) => {
      await mkdir(dirname(path), { recursive: true })
      await fsWriteFile(path, content)
    })

  const emit = async (content: string, output?: string): Promise<void> => {
    const final = formatMarkdown(content)
    if (output) await writeFile(output, final)
    else writeStdout(final)
  }

  const deliver = async (
    command: string,
    content: string,
    cliOptions: CliOptions,
    options: SharedOptions,
  ): Promise<void> => {
    if (options.comment) {
      if (cliOptions.pr === undefined) throw new Error("--comment requires --pr")
      const result = await postComment({ pr: cliOptions.pr, command, body: content })
      writeStdout(
        `Posted ${command} comment to PR #${cliOptions.pr} (${result.action})${result.url ? `: ${result.url}` : ""}\n`,
      )
      return
    }
    await emit(content, options.output)
  }

  const program = new Command()
    .name("revoid")
    .version("0.1.0")
    .addHelpText(
      "after",
      `
Shared Options:
  --diff-file <path>  read diff from a file
  --pr <number>       read diff from a GitHub pull request
  --base <ref>        diff the current worktree against a base ref
  --model <id>        model id, optional go/ or zen/ prefix (default: ${DEFAULT_MODEL}; or set ${MODEL_ENV})
  --language <lang>   language for the generated prose (e.g. Japanese; default: English)
  --no-context        disable repository context tools (read_file/grep)`,
    )
    .exitOverride()
    .configureOutput({
      writeOut: writeStdout,
      writeErr: writeStderr,
      outputError: (text, write) => write(text),
    })

  for (const commandConfig of commands) {
    addSharedOptions(program.command(commandConfig.name).description(commandConfig.description)).action(
      async (options: SharedOptions) => {
        const cliOptions = normalizeCliOptions(commandConfig.name, options)
        const config = await loadConfig()
        const collected = normalizeInput(await collectInput(cliOptions))
        const { input, note } = applyDiffBudget(collected, config.maxDiffTokens ?? DEFAULT_MAX_DIFF_TOKENS)
        const microOptimizations = options.microOpt ?? config.microOptimizations ?? false
        const language = options.language ?? config.language
        const promptOptions = {
          microOptimizations,
          ...(config.rules ? { rules: config.rules } : {}),
          ...(language ? { language } : {}),
        }
        const prompt = buildPrompt(cliOptions.command, input, promptOptions) + note
        const runOptions = resolveRunOptions(cliOptions, config, process.env)

        if (options.comment) {
          if (cliOptions.pr === undefined) throw new Error("--comment requires --pr")
          const result = JSON.parse(await analyze(cliOptions.command, prompt, { ...runOptions, format: "json" }))
          const inline = await postInlineComments(cliOptions.command, result, input.diff, cliOptions.pr, postReview)
          const posted = await postComment({
            pr: cliOptions.pr,
            command: cliOptions.command,
            body: renderResult(cliOptions.command, result),
          })
          writeStdout(
            `Posted ${cliOptions.command} comment to PR #${cliOptions.pr} (${posted.action})${inline}${posted.url ? `: ${posted.url}` : ""}\n`,
          )
          return
        }

        if (options.json) runOptions.format = "json"
        const output = await analyze(cliOptions.command, prompt, runOptions)
        await emit(output, options.output)
      },
    )
  }

  addSharedOptions(
    program
      .command("ask")
      .description("answer a question about a pull request")
      .argument("<question>", "the question to answer"),
  ).action(async (question: string, options: SharedOptions) => {
    // `command` is unused for ask (free-text, not a structured command); reuse
    // "review" only to gather the diff/PR input.
    const cliOptions = normalizeCliOptions("review", options)
    const config = await loadConfig()
    const collected = normalizeInput(await collectInput(cliOptions))
    const { input, note } = applyDiffBudget(collected, config.maxDiffTokens ?? DEFAULT_MAX_DIFF_TOKENS)
    const language = options.language ?? config.language
    const prompt = buildAskPrompt(question, input, language ? { language } : {}) + note
    const runOptions = resolveRunOptions(cliOptions, config, process.env)
    const answer = await ask(prompt, runOptions)
    const output = options.json ? JSON.stringify({ answer }, null, 2) : answer
    await deliver("ask", output, cliOptions, options)
  })

  program
    .command("config")
    .description("show the configuration and rules reference")
    .option("--json", "output the reference as JSON")
    .action(async (options: { json?: boolean }) => {
      const current = await loadConfig()
      if (options.json) {
        writeStdout(`${JSON.stringify({ reference: configReferenceData(), current }, null, 2)}\n`)
        return
      }
      const body =
        Object.keys(current).length > 0
          ? `${configReference()}\n\n## Current ${CONFIG_FILENAME}\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\``
          : configReference()
      writeStdout(formatMarkdown(body))
    })

  program
    .command("setup")
    .description("register a GitHub App (manifest flow) and wire up Actions secrets")
    .option("--org <org>", "create the App under an organization (default: current repo owner)")
    .option("--repo <owner/repo>", "target repository (default: current repository)")
    .option("--name <name>", "App name (default: revoid; editable in the browser)")
    .option("--port <number>", "local callback server port (default: ephemeral)", parsePositiveInteger)
    .option("--public", "make the App public/installable by others (default: private)")
    .option("--no-browser", "do not auto-open the browser; print the URLs instead")
    .action(async (options: SetupCliOptions) => {
      const setupOptions: SetupOptions = {}
      if (options.org) setupOptions.org = options.org
      if (options.repo) setupOptions.repo = options.repo
      if (options.name) setupOptions.name = options.name
      if (options.port !== undefined) setupOptions.port = options.port
      if (options.public) setupOptions.public = true
      if (options.browser === false) setupOptions.noBrowser = true
      await runSetup(setupOptions)
    })

  return program
}

interface SetupCliOptions {
  org?: string
  repo?: string
  name?: string
  port?: number
  public?: boolean
  // commander stores --no-browser as `browser: false`
  browser?: boolean
}

export async function runCli(args: string[], deps: RunCliDeps = {}): Promise<number> {
  const writeStderr = deps.writeStderr ?? ((text: string) => process.stderr.write(text))
  const program = createProgram(deps)

  try {
    await program.parseAsync(args, { from: "user" })
    if (args.length === 0) {
      throw new Error("Unknown command: (missing). Expected describe, review, improve, or all.")
    }
    return 0
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode
    }

    const message = error instanceof Error ? error.message : String(error)
    writeStderr(`revoid: ${message}\n`)
    return 1
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("must be a positive integer")
  }
  return parsed
}

function parseLanguage(value: string): string {
  const result = languageSchema.safeParse(value)
  if (!result.success) {
    throw new InvalidArgumentError(result.error.issues[0]?.message ?? "invalid language")
  }
  return result.data
}

function normalizeCliOptions(
  command: RevoidCommand,
  options: { diffFile?: string; pr?: number; base?: string; model?: string; context?: boolean },
): CliOptions {
  const cliOptions: CliOptions = { command, context: options.context ?? true }
  if (options.pr) cliOptions.pr = options.pr
  if (options.base) cliOptions.base = options.base
  if (options.diffFile) cliOptions.diffFile = options.diffFile
  if (options.model) cliOptions.model = options.model
  return cliOptions
}

function normalizeInput(input: RunCliInput): NormalizedInput {
  const normalized: NormalizedInput = { command: input.command, source: input.source, diff: input.diff }
  if (input.pr) normalized.pr = input.pr
  if (input.base) normalized.base = input.base
  if (input.diffFile) normalized.diffFile = input.diffFile
  return normalized
}

function isMainModule(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isMainModule()) {
  const code = await runCli(process.argv.slice(2))
  process.exit(code)
}

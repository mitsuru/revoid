#!/usr/bin/env bun
import { Command, CommanderError, InvalidArgumentError } from "commander"
import { analyze as defaultAnalyze } from "./analyze"
import { ask as defaultAsk } from "./ask"
import { loadConfig as defaultLoadConfig, type RebotConfig } from "./config"
import { postComment as defaultPostComment, type PostCommentResult } from "./github"
import { collectInput as defaultCollectInput } from "./inputs"
import { DEFAULT_MODEL, MODEL_ENV } from "./model"
import { formatMarkdown } from "./output"
import { buildAskPrompt, buildPrompt } from "./prompts"
import type { CliOptions, NormalizedInput, PullRequestMetadata, RebotCommand } from "./types"

type RunCliInput = Omit<NormalizedInput, "base" | "diffFile" | "pr"> & {
  base?: string | undefined
  diffFile?: string | undefined
  pr?: PullRequestMetadata | undefined
}

interface RunCliDeps {
  collectInput?: (options: CliOptions) => Promise<RunCliInput>
  analyze?: (command: RebotCommand, prompt: string, options?: RunOptions) => Promise<string>
  ask?: (prompt: string, options?: RunOptions) => Promise<string>
  loadConfig?: () => Promise<RebotConfig>
  postComment?: (opts: { pr: number; command: string; body: string }) => Promise<PostCommentResult>
  writeStdout?: (text: string) => void
  writeStderr?: (text: string) => void
  writeFile?: (path: string, content: string) => Promise<void>
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
  context?: boolean
  json?: boolean
  output?: string
  comment?: boolean
}

function addSharedOptions(command: Command): Command {
  return command
    .option("--diff-file <path>", "read diff from a file")
    .option("--pr <number>", "read diff from a GitHub pull request", parsePositiveInteger)
    .option("--base <ref>", "diff the current worktree against a base ref")
    .option("--model <id>", `model id, optional go/ or zen/ prefix (default: ${DEFAULT_MODEL}; or set ${MODEL_ENV})`)
    .option("--no-context", "disable repository context tools (read_file/grep)")
    .option("--json", "output raw JSON instead of Markdown")
    .option("--output <file>", "write output to a file instead of stdout")
    .option("--comment", "post the result as a PR comment (requires --pr)")
}

function resolveRunOptions(
  cliOptions: CliOptions,
  config: RebotConfig,
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

const commands: Array<{ name: RebotCommand; description: string }> = [
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
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text))
  const writeStderr = deps.writeStderr ?? ((text: string) => process.stderr.write(text))
  const writeFile = deps.writeFile ?? (async (path: string, content: string) => void (await Bun.write(path, content)))

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
    .name("rebot")
    .version("0.1.0")
    .addHelpText(
      "after",
      `
Shared Options:
  --diff-file <path>  read diff from a file
  --pr <number>       read diff from a GitHub pull request
  --base <ref>        diff the current worktree against a base ref
  --model <id>        model id, optional go/ or zen/ prefix (default: ${DEFAULT_MODEL}; or set ${MODEL_ENV})
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
        const input = normalizeInput(await collectInput(cliOptions))
        const prompt = buildPrompt(cliOptions.command, input)
        const runOptions = resolveRunOptions(cliOptions, config, process.env)
        if (options.json) runOptions.format = "json"
        const output = await analyze(cliOptions.command, prompt, runOptions)
        await deliver(cliOptions.command, output, cliOptions, options)
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
    const input = normalizeInput(await collectInput(cliOptions))
    const prompt = buildAskPrompt(question, input)
    const runOptions = resolveRunOptions(cliOptions, config, process.env)
    const answer = await ask(prompt, runOptions)
    const output = options.json ? JSON.stringify({ answer }, null, 2) : answer
    await deliver("ask", output, cliOptions, options)
  })

  return program
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
    writeStderr(`rebot: ${message}\n`)
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

function normalizeCliOptions(
  command: RebotCommand,
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

if (import.meta.main) {
  const code = await runCli(Bun.argv.slice(2))
  process.exit(code)
}

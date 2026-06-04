import { readFile } from "node:fs/promises"
import { execCommand, type ExecCommand } from "./exec"
import type { CliOptions, NormalizedInput, PullRequestMetadata } from "./types"

interface GhFile {
  path?: string
}

interface GhPrView {
  number: number
  title?: string
  body?: string
  url?: string
  baseRefName?: string
  headRefName?: string
  files?: GhFile[]
}

interface CollectInputDeps {
  exec?: ExecCommand
  readTextFile?: (path: string) => Promise<string>
}

export async function collectInput(options: CliOptions, deps: CollectInputDeps = {}): Promise<NormalizedInput> {
  const exec = deps.exec ?? execCommand
  const readTextFile = deps.readTextFile ?? ((path: string) => readFile(path, "utf8"))

  if (options.diffFile) {
    const diff = await readTextFile(options.diffFile)
    assertNonEmptyDiff(diff)
    return { command: options.command, source: "diff-file", diff, diffFile: options.diffFile }
  }

  if (options.pr !== undefined) {
    const diff = await exec("gh", ["pr", "diff", String(options.pr)])
    assertNonEmptyDiff(diff)
    const json = await exec("gh", [
      "pr",
      "view",
      String(options.pr),
      "--json",
      "number,title,body,files,baseRefName,headRefName,url",
    ])
    return { command: options.command, source: "github-pr", diff, pr: parseGhPr(json) }
  }

  if (options.base) {
    const diff = await exec("git", ["diff", `${options.base}...HEAD`])
    assertNonEmptyDiff(diff)
    return { command: options.command, source: "git-base", diff, base: options.base }
  }

  const diff = await exec("git", ["diff"])
  assertNonEmptyDiff(diff)
  return { command: options.command, source: "git-worktree", diff }
}

function parseGhPr(json: string): PullRequestMetadata {
  const parsed = JSON.parse(json) as GhPrView
  return {
    number: parsed.number,
    title: parsed.title ?? "",
    body: parsed.body ?? "",
    url: parsed.url ?? "",
    baseRefName: parsed.baseRefName ?? "",
    headRefName: parsed.headRefName ?? "",
    files: (parsed.files ?? []).map((file) => file.path).filter((path): path is string => Boolean(path)),
  }
}

function assertNonEmptyDiff(diff: string): void {
  if (diff.trim().length === 0) {
    throw new Error("Diff is empty; nothing to analyze")
  }
}

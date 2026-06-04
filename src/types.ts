export type RebotCommand = "describe" | "review" | "improve" | "all"

export type InputSource = "diff-file" | "github-pr" | "git-base" | "git-worktree"

export interface PullRequestMetadata {
  number: number
  title: string
  body: string
  url: string
  baseRefName: string
  headRefName: string
  files: string[]
}

export interface NormalizedInput {
  command: RebotCommand
  source: InputSource
  diff: string
  pr?: PullRequestMetadata
  base?: string
  diffFile?: string
}

export interface CliOptions {
  command: RebotCommand
  pr?: number
  base?: string
  diffFile?: string
}

export interface RunResult {
  markdown: string
}

import { CONFIG_FILENAME } from "./config"
import { DEFAULT_MAX_DIFF_TOKENS } from "./diff"
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_MAX_STEPS, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from "./model"

export interface ConfigKeyDoc {
  key: string
  type: string
  default: string
  description: string
}

export interface ConfigReferenceData {
  file: string
  keys: ConfigKeyDoc[]
  gateways: { zen: string; go: string }
  languages: string[]
  example: string
}

const EXAMPLE = `model = "go/deepseek-v4-pro"
language = "Japanese"
context = true
maxDiffTokens = ${DEFAULT_MAX_DIFF_TOKENS}
microOptimizations = false

[guardrails]
maxSteps = ${DEFAULT_MAX_STEPS}
timeoutMs = ${DEFAULT_TIMEOUT_MS}
maxOutputTokens = ${DEFAULT_MAX_OUTPUT_TOKENS}

[[rules]]
path = "src/api/**"
guidance = "Verify authentication and authorization on every endpoint; validate all inputs."
name = "api"`

export function configReferenceData(): ConfigReferenceData {
  return {
    file: CONFIG_FILENAME,
    keys: [
      {
        key: "model",
        type: "string",
        default: `${DEFAULT_MODEL}`,
        description: "Model id. Optional prefix go/ or zen/ selects the gateway (no prefix = zen).",
      },
      {
        key: "language",
        type: "string",
        default: "English",
        description:
          "Language for the model's generated prose (e.g. Japanese). Enum values and code are kept as-is.",
      },
      {
        key: "context",
        type: "boolean",
        default: "true",
        description: "Give the model read_file/grep tools to inspect the repository beyond the diff.",
      },
      {
        key: "maxDiffTokens",
        type: "number",
        default: `${DEFAULT_MAX_DIFF_TOKENS}`,
        description: "Diffs larger than this (chars/4 estimate) are reduced; noise files are dropped first.",
      },
      {
        key: "microOptimizations",
        type: "boolean",
        default: "false",
        description: "Include low-severity performance micro-optimization findings.",
      },
      {
        key: "guardrails.maxSteps",
        type: "number",
        default: `${DEFAULT_MAX_STEPS}`,
        description: "Maximum tool-use steps in the review loop.",
      },
      {
        key: "guardrails.timeoutMs",
        type: "number",
        default: `${DEFAULT_TIMEOUT_MS}`,
        description: "Overall wall-clock budget per run, in milliseconds.",
      },
      {
        key: "guardrails.maxOutputTokens",
        type: "number",
        default: `${DEFAULT_MAX_OUTPUT_TOKENS}`,
        description: "Maximum output tokens per model call.",
      },
      {
        key: "rules",
        type: "array of { path (glob), guidance (string), name? (string) }",
        default: "[]",
        description:
          "Path-based review guidance. When a changed file matches a rule's glob, its guidance is added to the review/all prompt.",
      },
    ],
    gateways: {
      zen: "https://opencode.ai/zen/v1 — claude-*, gpt-*, gemini-*, deepseek-v4-flash, ...",
      go: "https://opencode.ai/zen/go/v1 — deepseek-v4-pro, qwen3.7-max, mimo-v2.5-pro, ...",
    },
    languages: ["TypeScript/JavaScript", "Go", "Python", "Rust", "Ruby"],
    example: EXAMPLE,
  }
}

export function configReference(): string {
  const data = configReferenceData()
  const rows = data.keys
    .map((key) => `| \`${key.key}\` | ${key.type} | ${key.default} | ${key.description} |`)
    .join("\n")

  return `# revoid configuration

Settings live in \`${data.file}\` in the working directory. Precedence: CLI flag > environment variable > config file > built-in default.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
${rows}

## Model gateways

Models are selected with a prefix (no prefix = zen):

- \`zen/\` — ${data.gateways.zen}
- \`go/\` — ${data.gateways.go}

## Language-specific checks

\`review\`/\`all\` automatically add checks for the languages changed in the PR: ${data.languages.join(", ")}.

## Path-based rules

Each \`[[rules]]\` entry attaches review guidance to files matching a glob \`path\`. The guidance is injected only when a changed file matches.

## Example

\`\`\`toml
${data.example}
\`\`\``
}

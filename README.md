# rebot

`rebot` is a PR-Agent-like CLI powered by the Vercel AI SDK, calling models
through the [opencode zen](https://opencode.ai/zen) gateway.

## Requirements

- Bun
- An opencode zen API key. Either set `REBOT_ZEN_API_KEY`, or sign in with
  `opencode auth login` so an `opencode-go` key is stored in
  `~/.local/share/opencode/auth.json`.
- Git for local diff input
- GitHub CLI (`gh`) for `--pr` input

## Install Dependencies

```bash
bun install
```

## Run in Development

```bash
bun run src/cli.ts review --diff-file fixtures/sample.patch
bun run src/cli.ts describe --pr 123
bun run src/cli.ts improve --base main
```

## Help

```bash
rebot --help
rebot review --help
rebot --version
```

## Build

```bash
bun run build
```

Creates `dist/rebot.js` (~1.2 MB), a bundle that runs with Bun:

```bash
./dist/rebot.js --help   # or: bun dist/rebot.js --help
```

Bun is required at runtime (the CLI uses Bun APIs).

### Standalone binary (optional)

```bash
bun run build:binary
```

Creates `./rebot`, a self-contained executable that needs no runtime. It is
large (~100 MB) because it embeds the Bun runtime.

## Commands

- `rebot describe`: summarize a PR or diff
- `rebot review`: produce review findings
- `rebot improve`: suggest improvements
- `rebot all`: produce description, review findings, and improvements
- `rebot changelog`: produce a changelog entry
- `rebot labels`: suggest labels for a PR
- `rebot ask "<question>"`: answer a question about a PR or diff

## Input Sources

Input selection order:

1. `--diff-file <path>`
2. `--pr <number>`
3. `--base <ref>`
4. default `git diff`

## Model Selection

Every command accepts `--model <id>`. Resolution order:

1. `--model <id>`
2. `REBOT_MODEL` environment variable
3. default `claude-sonnet-4-6`

Models live on two opencode gateways. Select one with a prefix (no prefix
defaults to zen):

| Prefix | Gateway | Examples |
| --- | --- | --- |
| `zen/` (default) | OpenCode Zen | `claude-sonnet-4-6`, `gpt-5.4`, `deepseek-v4-flash` |
| `go/` | OpenCode Go | `deepseek-v4-pro`, `qwen3.7-max`, `mimo-v2.5-pro` |

`opencode/` and `opencode-go/` work as aliases for `zen/` and `go/`.

```bash
rebot review --diff-file fixtures/sample.patch --model gpt-5.4
rebot review --diff-file fixtures/sample.patch --model go/deepseek-v4-pro
```

## Repository Context

By default rebot gives the model `read_file` and `grep` tools rooted at the
current directory, so it can inspect code beyond the diff (callers, definitions,
types) before reporting. Disable this with `--no-context`.

`scripts/eval-context.ts` is a manual eval (it calls a live model) that compares
review quality with context on vs off on `fixtures/eval/`, where the only bug
lives outside the diff:

```bash
bun run scripts/eval-context.ts
```

With context on, rebot catches the cross-file bug; with it off, it cannot.

## Configuration

Defaults can be set in a `.rebot.toml` in the working directory. Precedence is
CLI flag > environment variable > config file > built-in default.

```toml
model = "go/deepseek-v4-pro"
context = true
maxDiffTokens = 50000      # large diffs are reduced to fit this budget
microOptimizations = false # opt in to performance micro-optimization findings

[guardrails]
maxSteps = 8
timeoutMs = 120000
maxOutputTokens = 8192
```

`review`/`all` automatically add language-specific checks for the languages in
the diff (TypeScript/JavaScript, Go, Python, Rust, Ruby). Micro-optimization
findings are off by default; enable them with `--micro-opt` or
`microOptimizations = true`.

Diffs larger than `maxDiffTokens` are reduced before review: noise files
(lockfiles, build output, snapshots) are dropped first, then remaining files are
kept until the budget is reached, and the omitted files are noted in the prompt.

## Output

- `--json`: print the raw structured result instead of Markdown (for `ask`, the
  JSON is `{ "answer": "..." }`).
- `--output <file>`: write the output to a file instead of stdout.

## Posting to GitHub

`--comment` posts the result to a PR (requires `--pr` and the `gh` CLI):

```bash
rebot review --pr 123 --comment
```

The summary is posted as a single comment and updated in place on re-runs (it
carries a hidden `<!-- rebot:<command> -->` marker). For `review`/`all`, findings
that land on changed lines are also posted as inline review comments.

### GitHub Action

`.github/workflows/rebot.yml` runs `rebot review --pr <n> --comment` on every
pull request. Add a `REBOT_ZEN_API_KEY` repository secret; the default
`GITHUB_TOKEN` lets `gh` post comments (`pull-requests: write`).

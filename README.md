# revoid

`revoid` is a PR-Agent-like CLI powered by the Vercel AI SDK, calling models
through the [opencode zen](https://opencode.ai/zen) gateway.

## Requirements

- Node.js 18 or newer
- An opencode zen API key. Either set `REVOID_ZEN_API_KEY`, or sign in with
  `opencode auth login` so an `opencode-go` key is stored in
  `~/.local/share/opencode/auth.json`.
- Git for local diff input
- GitHub CLI (`gh`) for `--pr` input

## Install

Run it without installing:

```bash
npx revoid --help
```

Or install globally:

```bash
npm install -g revoid
revoid --help
```

```bash
revoid review --diff-file fixtures/sample.patch
revoid describe --pr 123
revoid improve --base main
revoid --version
```

## Development

This repo uses [Bun](https://bun.sh) as the dev toolchain (test runner and
bundler). Runtime output targets Node.js, so the published CLI needs only Node.

```bash
bun install                 # install dependencies
bun run dev review --diff-file fixtures/sample.patch
bun test                    # run the test suite
bun run typecheck           # tsc --noEmit
```

## Build

```bash
bun run build
```

Creates `dist/revoid.js` (~1.2 MB), a Node-targeted bundle. It runs with plain
Node:

```bash
node dist/revoid.js --help
```

`npm publish` builds this automatically via the `prepack` script.

### Standalone binary (optional)

```bash
bun run build:binary
```

Creates `./revoid`, a self-contained executable that needs no runtime. It is
large (~100 MB) because it embeds the Bun runtime.

## Commands

- `revoid describe`: summarize a PR or diff
- `revoid review`: produce review findings
- `revoid improve`: suggest improvements
- `revoid all`: produce description, review findings, and improvements
- `revoid changelog`: produce a changelog entry
- `revoid labels`: suggest labels for a PR
- `revoid ask "<question>"`: answer a question about a PR or diff
- `revoid config`: print the configuration and rules reference (`--json` for machine-readable)

## Input Sources

Input selection order:

1. `--diff-file <path>`
2. `--pr <number>`
3. `--base <ref>`
4. default `git diff`

## Model Selection

Every command accepts `--model <id>`. Resolution order:

1. `--model <id>`
2. `REVOID_MODEL` environment variable
3. default `claude-sonnet-4-6`

Models live on two opencode gateways. Select one with a prefix (no prefix
defaults to zen):

| Prefix | Gateway | Examples |
| --- | --- | --- |
| `zen/` (default) | OpenCode Zen | `claude-sonnet-4-6`, `gpt-5.4`, `deepseek-v4-flash` |
| `go/` | OpenCode Go | `deepseek-v4-pro`, `qwen3.7-max`, `mimo-v2.5-pro` |

`opencode/` and `opencode-go/` work as aliases for `zen/` and `go/`.

```bash
revoid review --diff-file fixtures/sample.patch --model gpt-5.4
revoid review --diff-file fixtures/sample.patch --model go/deepseek-v4-pro
```

## Repository Context

By default revoid gives the model `read_file` and `grep` tools rooted at the
current directory, so it can inspect code beyond the diff (callers, definitions,
types) before reporting. Disable this with `--no-context`.

`scripts/eval-context.ts` is a manual eval (it calls a live model) that compares
review quality with context on vs off on `fixtures/eval/`, where the only bug
lives outside the diff:

```bash
bun run scripts/eval-context.ts
```

With context on, revoid catches the cross-file bug; with it off, it cannot.

## Configuration

Defaults can be set in a `.revoid.toml` in the working directory. Precedence is
CLI flag > environment variable > config file > built-in default.

```toml
model = "go/deepseek-v4-pro"
language = "Japanese"      # language for the generated prose (default: English)
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

Set `language` (or `--language <lang>`) to have revoid write its prose —
finding descriptions, summaries, suggestions — in another language such as
Japanese. Code, identifiers, and the fixed severity/category labels stay in
English.

Path-based rules attach review guidance to files matching a glob:

```toml
[[rules]]
path = "src/api/**"
guidance = "Verify authentication and authorization on every endpoint."
name = "api"
```

Run `revoid config` for the full reference (or `revoid config --json` for a
machine-readable form an agent can consume).

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
revoid review --pr 123 --comment
```

The summary is posted as a single comment and updated in place on re-runs (it
carries a hidden `<!-- revoid:<command> -->` marker). For `review`/`all`, findings
that land on changed lines are also posted as inline review comments.

### GitHub Action

`.github/workflows/revoid.yml` runs `revoid review --pr <n> --comment` on every
pull request. Add a `REVOID_ZEN_API_KEY` repository secret; the default
`GITHUB_TOKEN` lets `gh` post comments (`pull-requests: write`).

### Post as `revoid[bot]` (GitHub App)

By default, comments come from `github-actions[bot]`. To post under a `revoid[bot]`
identity, run a one-time setup that registers a GitHub App via the manifest flow:

```bash
revoid setup            # add --org <org> to register under an organization
```

`setup` starts a local callback server, opens the browser to GitHub's App
creation page (pre-filled with the right permissions: `pull_requests: write`,
`contents: read`, `metadata: read`), then:

- exchanges the temporary code for the App's credentials,
- stores `REVOID_APP_ID` and `REVOID_APP_PRIVATE_KEY` as Actions secrets (the
  private key is piped to `gh secret set` and never written to disk),
- rewrites `.github/workflows/revoid.yml` to mint an App token with
  [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token),
- opens the App install page so you can install it on the repository.

On a headless/SSH host, the server also prints a LAN URL you can open from
another device, and `--no-browser` skips auto-opening entirely. The flow always
registers a new App, so re-running `setup` warns before creating a duplicate.

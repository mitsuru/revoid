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

The first version prints Markdown to stdout and does not post comments to GitHub.

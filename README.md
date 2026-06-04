# rebot

`rebot` is a PR-Agent-like CLI powered by opencode.

## Requirements

- Bun
- opencode provider authentication configured for your environment
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

## Build Single Binary

```bash
bun run build
```

The build creates `./rebot`.

## Commands

- `rebot describe`: summarize a PR or diff
- `rebot review`: produce review findings
- `rebot improve`: suggest improvements
- `rebot all`: produce description, review findings, and improvements

## Input Sources

Input selection order:

1. `--diff-file <path>`
2. `--pr <number>`
3. `--base <ref>`
4. default `git diff`

The first version prints Markdown to stdout and does not post comments to GitHub.

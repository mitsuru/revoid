# rebot CLI Help Design

## Summary

Add first-class CLI help and version output to `rebot` using `commander`. The goal is to make the tool self-describing for humans and AI agents without expanding the feature scope beyond the existing `describe`, `review`, `improve`, and `all` workflows.

## Goals

- Provide standard help output through `rebot --help`, `rebot -h`, and `rebot help`.
- Provide command-specific help through `rebot <command> --help`, `rebot <command> -h`, and `rebot help <command>`.
- Provide version output through `rebot --version` and `rebot -V`.
- Keep existing command behavior and input options intact.
- Use a maintained CLI parser instead of growing custom parsing logic.
- Document help and version usage in `README.md`.

## Non-Goals

- Machine-readable JSON help output.
- Shell completion generation.
- README generation from CLI metadata.
- Changing prompt behavior, opencode SDK behavior, or input collection semantics.
- Posting GitHub comments or adding new review workflows.

## User Interface

Top-level help:

```bash
rebot --help
rebot -h
rebot help
```

Command help:

```bash
rebot describe --help
rebot review -h
rebot help improve
```

Version:

```bash
rebot --version
rebot -V
```

Commands:

```bash
rebot describe [options]
rebot review [options]
rebot improve [options]
rebot all [options]
```

Shared options:

```bash
--diff-file <path>  Read a patch file instead of querying git or GitHub
--pr <number>       Read PR metadata and diff through GitHub CLI
--base <ref>        Read git diff <ref>...HEAD
```

Input precedence remains unchanged:

1. `--diff-file`
2. `--pr`
3. `--base`
4. default `git diff`

## Architecture

Use `commander` in `src/cli.ts` as the command and option parser. Replace the current hand-written `parseArgs` implementation with a small `createProgram()` function that wires command metadata, shared options, version, help behavior, and actions.

The existing orchestration stays the same after options are parsed:

```text
commander action
  -> collectInput(options)
  -> buildPrompt(command, input)
  -> runOpencodePrompt(prompt)
  -> formatMarkdown(result.markdown)
  -> stdout
```

`runCli(args, deps)` remains the programmatic entry point for tests and the binary. It creates the commander program with injected dependencies, parses the provided args, and returns an exit code.

## Error Handling

- Help and version output go to stdout and return exit code `0`.
- Unknown commands and unknown options use commander error handling and return non-zero.
- Runtime errors from input collection or opencode execution keep the existing `rebot: <message>` stderr style where practical.
- Help/version paths must not call opencode or input collection.

## Testing

Add or update CLI tests to cover:

- Top-level help includes commands and shared options.
- Command-specific help includes the command description and shared options.
- `--version` outputs `0.1.0`, matching `package.json`.
- `review --pr 123` still reaches the existing orchestration path with command `review` and PR number `123`.
- Unknown options fail without invoking opencode.

Existing tests for input collection, prompt construction, opencode runner, output formatting, and shared types should continue to pass.

## Documentation

Update `README.md` with a short Help section:

```bash
rebot --help
rebot review --help
rebot --version
```

The README should continue to document commands, input source precedence, and build instructions.

import { expect, test } from "bun:test"
import { collectInput } from "../src/inputs"
import type { ExecCommand } from "../src/exec"

const sampleDiff = "diff --git a/src/a.ts b/src/a.ts\n+console.log('x')\n"

test("collectInput reads an explicit diff file first", async () => {
  const input = await collectInput(
    { command: "review", diffFile: "fixtures/sample.patch" },
    {
      exec: async () => {
        throw new Error("exec should not run for diff-file input")
      },
      readTextFile: async (path) => {
        expect(path).toBe("fixtures/sample.patch")
        return sampleDiff
      },
    },
  )

  expect(input.source).toBe("diff-file")
  expect(input.diff).toContain("diff --git")
  expect(input.diffFile).toBe("fixtures/sample.patch")
})

test("collectInput reads github PR metadata and diff", async () => {
  const commands: string[] = []
  const exec: ExecCommand = async (command, args) => {
    commands.push([command, ...args].join(" "))
    if (args[0] === "pr" && args[1] === "diff") return sampleDiff
    return JSON.stringify({
      number: 123,
      title: "Add feature",
      body: "Feature body",
      url: "https://github.com/acme/repo/pull/123",
      baseRefName: "main",
      headRefName: "feature",
      files: [{ path: "src/a.ts" }],
    })
  }

  const input = await collectInput({ command: "describe", pr: 123 }, { exec })

  expect(input.source).toBe("github-pr")
  expect(input.pr?.number).toBe(123)
  expect(input.pr?.files).toEqual(["src/a.ts"])
  expect(commands).toEqual([
    "gh pr diff 123",
    "gh pr view 123 --json number,title,body,files,baseRefName,headRefName,url",
  ])
})

test("collectInput reads git base diff", async () => {
  const exec: ExecCommand = async (command, args) => {
    expect(command).toBe("git")
    expect(args).toEqual(["diff", "main...HEAD"])
    return sampleDiff
  }

  const input = await collectInput({ command: "improve", base: "main" }, { exec })

  expect(input.source).toBe("git-base")
  expect(input.base).toBe("main")
})

test("collectInput reads worktree diff by default", async () => {
  const exec: ExecCommand = async (command, args) => {
    expect(command).toBe("git")
    expect(args).toEqual(["diff"])
    return sampleDiff
  }

  const input = await collectInput({ command: "review" }, { exec })

  expect(input.source).toBe("git-worktree")
})

test("collectInput rejects empty diffs", async () => {
  await expect(
    collectInput(
      { command: "review", diffFile: "empty.patch" },
      { readTextFile: async () => "\n" },
    ),
  ).rejects.toThrow("Diff is empty")
})

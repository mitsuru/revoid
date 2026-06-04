import { expect, test } from "bun:test"
import type { NormalizedInput } from "../src/types"

test("NormalizedInput supports a github PR review context", () => {
  const input: NormalizedInput = {
    command: "review",
    source: "github-pr",
    diff: "diff --git a/a.ts b/a.ts",
    pr: {
      number: 123,
      title: "Add feature",
      body: "Feature body",
      url: "https://github.com/acme/repo/pull/123",
      baseRefName: "main",
      headRefName: "feature",
      files: ["src/a.ts"],
    },
  }

  expect(input.command).toBe("review")
  expect(input.pr?.files).toEqual(["src/a.ts"])
})

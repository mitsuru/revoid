import { describe, expect, test } from "bun:test"
import { commentableLines, compressDiff, parseDiffFiles } from "../src/diff"

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 export function a() {
-  return 1
+  return 2
+  // note
 }
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1,2 @@
+export const b = 1
+export const c = 2
`

describe("commentableLines", () => {
  test("collects added and context lines on the new side per file", () => {
    const map = commentableLines(DIFF)

    // a.ts new side: line1 context, line2 '+return 2', line3 '+// note', line4 context '}'
    expect([...(map.get("src/a.ts") ?? [])].sort((x, y) => x - y)).toEqual([1, 2, 3, 4])
    // b.ts new file: lines 1,2 added
    expect([...(map.get("src/b.ts") ?? [])].sort((x, y) => x - y)).toEqual([1, 2])
  })

  test("ignores removed lines for the new side numbering", () => {
    const map = commentableLines(DIFF)
    // the removed "return 1" must not shift new-side numbering: line 2 is "return 2"
    expect(map.get("src/a.ts")?.has(2)).toBe(true)
  })

  test("returns an empty map for an empty diff", () => {
    expect(commentableLines("").size).toBe(0)
  })
})

describe("parseDiffFiles", () => {
  test("splits a multi-file diff with per-file counts", () => {
    const files = parseDiffFiles(DIFF)

    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"])
    const a = files[0]
    expect(a?.added).toBe(2)
    expect(a?.removed).toBe(1)
    expect(a?.patch).toContain("diff --git a/src/a.ts")
    const b = files[1]
    expect(b?.added).toBe(2)
    expect(b?.removed).toBe(0)
  })

  test("uses the old path for a deletion (+++ /dev/null)", () => {
    const del = `diff --git a/old.ts b/old.ts
deleted file mode 100644
--- a/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const gone = 1
`
    const files = parseDiffFiles(del)
    expect(files).toHaveLength(1)
    expect(files[0]?.path).toBe("old.ts")
    expect(files[0]?.removed).toBe(1)
  })

  test("returns an empty array for an empty diff", () => {
    expect(parseDiffFiles("")).toEqual([])
  })
})

function fileBlock(path: string, lines: number): string {
  const body = Array.from({ length: lines }, (_, i) => `+line ${i}`).join("\n")
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1,${lines} @@\n${body}\n`
}

describe("compressDiff", () => {
  const big = fileBlock("src/a.ts", 40) + fileBlock("src/b.ts", 40) + fileBlock("bun.lock", 40)

  test("omits noise files but keeps source when within budget", () => {
    const { diff, omitted } = compressDiff(big, 100000)
    expect(diff).toContain("src/a.ts")
    expect(diff).toContain("src/b.ts")
    expect(diff).not.toContain("bun.lock")
    expect(omitted).toContain("bun.lock")
  })

  test("drops files that do not fit the token budget", () => {
    // budget large enough for one ~40-line file but not two
    const oneFileTokens = Math.ceil(fileBlock("src/a.ts", 40).length / 4)
    const { diff, omitted } = compressDiff(big, oneFileTokens + 5)
    expect(diff).toContain("src/a.ts")
    expect(diff).not.toContain("src/b.ts")
    expect(omitted).toContain("src/b.ts")
    expect(omitted).toContain("bun.lock")
  })

  test("returns the diff unchanged when nothing is omitted and it fits", () => {
    const small = fileBlock("src/a.ts", 3)
    const { omitted } = compressDiff(small, 100000)
    expect(omitted).toEqual([])
  })
})

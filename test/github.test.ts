import { describe, expect, test } from "bun:test"
import { commentMarker, postComment } from "../src/github"

type Call = { command: string; args: string[] }

function fakeExec(handlers: (call: Call) => string) {
  const calls: Call[] = []
  const exec = async (command: string, args: string[]) => {
    const call = { command, args }
    calls.push(call)
    return handlers(call)
  }
  return { exec, calls }
}

describe("commentMarker", () => {
  test("is command-specific and HTML-hidden", () => {
    expect(commentMarker("review")).toBe("<!-- rebot:review -->")
  })
})

describe("postComment", () => {
  test("creates a new comment when none carries the marker", async () => {
    const { exec, calls } = fakeExec(({ args }) => {
      if (args[0] === "repo") return "acme/repo\n"
      if (args[0] === "api" && args.includes("--paginate")) return "[]"
      if (args.includes("-X") && args.includes("POST")) return '{"id":111,"html_url":"https://x/111"}'
      return ""
    })

    const result = await postComment({ pr: 7, command: "review", body: "# Review Findings" }, { exec })

    expect(result.action).toBe("created")
    expect(result.id).toBe(111)
    const post = calls.find((c) => c.args.includes("POST"))
    expect(post?.args.join(" ")).toContain("repos/acme/repo/issues/7/comments")
    const bodyArg = post?.args.find((a) => a.startsWith("body="))
    expect(bodyArg).toContain("<!-- rebot:review -->")
  })

  test("updates the existing marked comment instead of creating a duplicate", async () => {
    const { exec, calls } = fakeExec(({ args }) => {
      if (args[0] === "repo") return "acme/repo"
      if (args[0] === "api" && args.includes("--paginate")) {
        return JSON.stringify([
          { id: 1, body: "unrelated" },
          { id: 42, body: "old result\n<!-- rebot:review -->" },
        ])
      }
      if (args.includes("PATCH")) return '{"id":42,"html_url":"https://x/42"}'
      return ""
    })

    const result = await postComment({ pr: 7, command: "review", body: "new body" }, { exec })

    expect(result.action).toBe("updated")
    expect(result.id).toBe(42)
    const patch = calls.find((c) => c.args.includes("PATCH"))
    expect(patch?.args.join(" ")).toContain("repos/acme/repo/issues/comments/42")
    expect(calls.some((c) => c.args.includes("POST"))).toBe(false)
  })
})

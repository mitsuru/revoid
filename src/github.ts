import { execCommand, type ExecCommand } from "./exec"

export function commentMarker(command: string): string {
  return `<!-- rebot:${command} -->`
}

interface PostCommentDeps {
  exec?: ExecCommand
}

export interface PostCommentResult {
  action: "created" | "updated"
  id: number
  url?: string
}

export async function postComment(
  opts: { pr: number; command: string; body: string },
  deps: PostCommentDeps = {},
): Promise<PostCommentResult> {
  const exec = deps.exec ?? execCommand
  const marker = commentMarker(opts.command)
  const fullBody = `${opts.body}\n\n${marker}`

  const repo = (await exec("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])).trim()

  const listJson = await exec("gh", ["api", `repos/${repo}/issues/${opts.pr}/comments`, "--paginate"])
  const comments = JSON.parse(listJson) as Array<{ id: number; body?: string }>
  const existing = comments.find((comment) => (comment.body ?? "").includes(marker))

  if (existing) {
    const updated = await exec("gh", [
      "api",
      "-X",
      "PATCH",
      `repos/${repo}/issues/comments/${existing.id}`,
      "-f",
      `body=${fullBody}`,
    ])
    return { action: "updated", ...parseComment(updated, existing.id) }
  }

  const created = await exec("gh", [
    "api",
    "-X",
    "POST",
    `repos/${repo}/issues/${opts.pr}/comments`,
    "-f",
    `body=${fullBody}`,
  ])
  return { action: "created", ...parseComment(created) }
}

function parseComment(json: string, fallbackId = 0): { id: number; url?: string } {
  try {
    const parsed = JSON.parse(json) as { id?: number; html_url?: string }
    const result: { id: number; url?: string } = { id: parsed.id ?? fallbackId }
    if (parsed.html_url) result.url = parsed.html_url
    return result
  } catch {
    return { id: fallbackId }
  }
}

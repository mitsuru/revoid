/**
 * Parses a unified diff and returns, per new-file path, the set of line numbers
 * that can carry a GitHub review comment on the RIGHT side: added (`+`) and
 * context (` `) lines within hunks.
 */
export function commentableLines(diff: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>()
  let currentFile: string | undefined
  let newLine = 0

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = parseNewPath(line)
      currentFile = path
      if (path && !result.has(path)) result.set(path, new Set())
      continue
    }

    if (line.startsWith("@@")) {
      newLine = parseHunkNewStart(line)
      continue
    }

    if (!currentFile || newLine === 0) continue

    if (line.startsWith("+")) {
      result.get(currentFile)?.add(newLine)
      newLine++
    } else if (line.startsWith("-")) {
      // removed line: old side only, new-side numbering unchanged
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file": not a content line
    } else if (line.startsWith(" ")) {
      // context line (always prefixed with a space in a unified diff)
      result.get(currentFile)?.add(newLine)
      newLine++
    }
  }

  return result
}

export interface DiffFile {
  path: string
  patch: string
  added: number
  removed: number
}

export function parseDiffFiles(diff: string): DiffFile[] {
  const lines = diff.split("\n")
  const files: DiffFile[] = []
  let block: string[] = []

  const flush = () => {
    if (block.length === 0) return
    files.push(toDiffFile(block))
    block = []
  }

  for (const line of lines) {
    if (line.startsWith("diff --git ")) flush()
    if (line.startsWith("diff --git ") || block.length > 0) block.push(line)
  }
  flush()

  return files
}

function toDiffFile(block: string[]): DiffFile {
  let path = ""
  let added = 0
  let removed = 0

  for (const line of block) {
    if (line.startsWith("+++ ")) {
      const newPath = parseNewPath(line)
      if (newPath) path = newPath
    } else if (line.startsWith("--- ")) {
      const oldPath = line.slice(4).trim().replace(/^a\//, "")
      if (!path && oldPath !== "/dev/null") path = oldPath
    } else if (line.startsWith("+")) {
      added++
    } else if (line.startsWith("-")) {
      removed++
    }
  }

  if (!path) {
    const header = block[0]?.match(/ b\/(.+)$/)
    if (header?.[1]) path = header[1]
  }

  return { path, patch: `${block.join("\n")}\n`, added, removed }
}

function parseNewPath(line: string): string | undefined {
  const raw = line.slice(4).trim()
  if (raw === "/dev/null") return undefined
  return raw.replace(/^b\//, "")
}

function parseHunkNewStart(line: string): number {
  const match = line.match(/\+(\d+)/)
  return match ? Number(match[1]) : 0
}

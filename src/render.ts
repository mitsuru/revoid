import type {
  AllResult,
  DescribeResult,
  ImproveResult,
  ReviewFinding,
  ReviewResult,
  Severity,
} from "./schema"
import type { RebotCommand } from "./types"

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"]

export function renderReview(result: ReviewResult): string {
  const parts: string[] = ["# Review Findings"]

  const metadata = renderReviewMetadata(result)
  if (metadata) parts.push(metadata)

  if (result.findings.length === 0) {
    parts.push("No findings.")
    if (result.summary) parts.push(result.summary)
    return parts.join("\n\n")
  }

  if (result.summary) parts.push(result.summary)

  const ordered = [...result.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  )
  for (const finding of ordered) {
    parts.push(renderFinding(finding))
  }

  return parts.join("\n\n")
}

function renderReviewMetadata(result: ReviewResult): string | undefined {
  const lines: string[] = []
  if (result.estimatedEffort !== undefined) {
    lines.push(`- **Estimated effort to review:** ${result.estimatedEffort}/5`)
  }
  if (result.hasTests !== undefined) {
    lines.push(`- **Relevant tests:** ${result.hasTests ? "yes" : "no"}`)
  }
  if (result.securityConcerns && result.securityConcerns.length > 0) {
    lines.push("- **Security concerns:**")
    for (const concern of result.securityConcerns) lines.push(`  - ${concern}`)
  }
  if (result.canBeSplit) {
    lines.push(`- **Can be split:** ${result.canBeSplit}`)
  }
  return lines.length > 0 ? lines.join("\n") : undefined
}

function renderFinding(finding: ReviewFinding): string {
  const lines: string[] = [`## [${finding.severity}] ${finding.title}`]

  const meta = [`**Category:** ${finding.category}`]
  const location = formatLocation(finding.file, finding.startLine, finding.endLine)
  if (location) meta.push(`**Location:** ${location}`)
  lines.push(meta.join(" · "))

  lines.push(finding.description)
  if (finding.suggestion) lines.push(`**Suggestion:** ${finding.suggestion}`)

  return lines.join("\n\n")
}

function formatLocation(file?: string, startLine?: number, endLine?: number): string | undefined {
  if (!file) return undefined
  if (startLine === undefined) return file
  if (endLine === undefined || endLine === startLine) return `${file}:${startLine}`
  return `${file}:${startLine}-${endLine}`
}

export function renderDescribe(result: DescribeResult): string {
  const sections: string[] = ["# Description"]

  if (result.prTypes && result.prTypes.length > 0) {
    sections.push("## Type", result.prTypes.join(", "))
  }
  if (result.labels && result.labels.length > 0) {
    sections.push("## Labels", result.labels.join(", "))
  }

  sections.push("## Summary", result.summary, "## Changed Areas", renderList(result.changedAreas))

  if (result.walkthrough && result.walkthrough.length > 0) {
    sections.push(
      "## Walkthrough",
      result.walkthrough.map((entry) => `- \`${entry.path}\` — ${entry.summary}`).join("\n"),
    )
  }

  sections.push(
    "## Notable Implementation Details",
    renderList(result.notableDetails),
    "## Suggested Test Focus",
    renderList(result.suggestedTestFocus),
  )

  return sections.join("\n\n")
}

function renderList(items: string[]): string {
  if (items.length === 0) return "_None_"
  return items.map((item) => `- ${item}`).join("\n")
}

export function renderImprove(result: ImproveResult): string {
  const parts: string[] = ["# Improvement Suggestions"]

  if (result.suggestions.length === 0) {
    parts.push("No improvement suggestions.")
    return parts.join("\n\n")
  }

  for (const suggestion of result.suggestions) {
    const heading = suggestion.kind ? `## [${suggestion.kind}] ${suggestion.title}` : `## ${suggestion.title}`
    const lines: string[] = [heading]
    const location = formatLocation(suggestion.file, suggestion.startLine, suggestion.endLine)
    if (location) lines.push(`**Location:** ${location}`)
    lines.push(suggestion.description)
    if (suggestion.existingCode) lines.push(`Current:\n\`\`\`\n${suggestion.existingCode}\n\`\`\``)
    if (suggestion.suggestedCode) lines.push(`Suggested:\n\`\`\`\n${suggestion.suggestedCode}\n\`\`\``)
    parts.push(lines.join("\n\n"))
  }

  return parts.join("\n\n")
}

export function renderAll(result: AllResult): string {
  return [
    renderDescribe(result.description),
    renderReview(result.review),
    renderImprove(result.improvements),
  ].join("\n\n")
}

export function renderResult(command: RebotCommand, result: unknown): string {
  switch (command) {
    case "describe":
      return renderDescribe(result as DescribeResult)
    case "review":
      return renderReview(result as ReviewResult)
    case "improve":
      return renderImprove(result as ImproveResult)
    case "all":
      return renderAll(result as AllResult)
  }
}

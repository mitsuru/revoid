import { describe, expect, test } from "bun:test"
import {
  renderAll,
  renderDescribe,
  renderImprove,
  renderResult,
  renderReview,
} from "../src/render"

describe("renderReview", () => {
  test("orders findings by severity and includes location, severity, and suggestion", () => {
    const md = renderReview({
      findings: [
        { title: "Minor naming", severity: "low", category: "style", description: "rename" },
        {
          title: "Null deref",
          severity: "critical",
          category: "correctness",
          file: "src/a.ts",
          startLine: 12,
          endLine: 18,
          description: "value may be undefined",
          suggestion: "guard with a null check",
        },
      ],
    })

    expect(md).toContain("# Review Findings")
    // critical must appear before low
    expect(md.indexOf("Null deref")).toBeLessThan(md.indexOf("Minor naming"))
    expect(md).toContain("src/a.ts:12-18")
    expect(md).toContain("critical")
    expect(md).toContain("guard with a null check")
  })

  test("renders a no-findings message and the summary", () => {
    const md = renderReview({ summary: "Looks fine, but add tests.", findings: [] })

    expect(md).toContain("# Review Findings")
    expect(md.toLowerCase()).toContain("no findings")
    expect(md).toContain("Looks fine, but add tests.")
  })

  test("renders a single-line location when only startLine is present", () => {
    const md = renderReview({
      findings: [
        { title: "X", severity: "high", category: "security", file: "a.ts", startLine: 5, description: "d" },
      ],
    })

    expect(md).toContain("a.ts:5")
    expect(md).not.toContain("a.ts:5-")
  })

  test("omits the location when the finding has no file", () => {
    const md = renderReview({
      findings: [{ title: "X", severity: "high", category: "security", description: "d" }],
    })

    expect(md).not.toContain("Location")
    expect(md).toContain("**Category:** security")
  })
})

describe("renderDescribe", () => {
  test("includes every section", () => {
    const md = renderDescribe({
      summary: "Adds an add() helper.",
      changedAreas: ["src/math.ts"],
      notableDetails: ["uses bigint"],
      suggestedTestFocus: ["overflow"],
    })

    expect(md).toContain("# Description")
    expect(md).toContain("Adds an add() helper.")
    expect(md).toContain("src/math.ts")
    expect(md).toContain("uses bigint")
    expect(md).toContain("overflow")
  })

  test("marks empty sections with _None_", () => {
    const md = renderDescribe({
      summary: "s",
      changedAreas: [],
      notableDetails: [],
      suggestedTestFocus: [],
    })

    expect(md).toContain("_None_")
  })
})

describe("renderImprove", () => {
  test("renders suggestions with fenced code", () => {
    const md = renderImprove({
      suggestions: [
        {
          title: "Extract constant",
          file: "src/a.ts",
          description: "magic number",
          suggestedCode: "const MAX = 10",
        },
      ],
    })

    expect(md).toContain("# Improvement Suggestions")
    expect(md).toContain("Extract constant")
    expect(md).toContain("```")
    expect(md).toContain("const MAX = 10")
  })

  test("states when there are no suggestions", () => {
    const md = renderImprove({ suggestions: [] })
    expect(md.toLowerCase()).toContain("no improvement")
  })

  test("omits the code fence when no suggestedCode is given", () => {
    const md = renderImprove({
      suggestions: [{ title: "Rename", description: "use a clearer name" }],
    })

    expect(md).toContain("Rename")
    expect(md).not.toContain("```")
  })
})

describe("renderAll", () => {
  test("includes all three top-level sections", () => {
    const md = renderAll({
      description: { summary: "s", changedAreas: [], notableDetails: [], suggestedTestFocus: [] },
      review: { findings: [] },
      improvements: { suggestions: [] },
    })

    expect(md).toContain("# Description")
    expect(md).toContain("# Review Findings")
    expect(md).toContain("# Improvement Suggestions")
  })
})

describe("renderResult", () => {
  test("dispatches per command", () => {
    expect(renderResult("review", { findings: [] })).toContain("# Review Findings")
    expect(
      renderResult("describe", {
        summary: "s",
        changedAreas: [],
        notableDetails: [],
        suggestedTestFocus: [],
      }),
    ).toContain("# Description")
    expect(renderResult("improve", { suggestions: [] })).toContain("# Improvement Suggestions")
    expect(
      renderResult("all", {
        description: { summary: "s", changedAreas: [], notableDetails: [], suggestedTestFocus: [] },
        review: { findings: [] },
        improvements: { suggestions: [] },
      }),
    ).toContain("# Review Findings")
  })
})

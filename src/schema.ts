import { z } from "zod"
import type { RebotCommand } from "./types"

export const severitySchema = z.enum(["critical", "high", "medium", "low", "info"])
export const categorySchema = z.enum([
  "correctness",
  "security",
  "performance",
  "maintainability",
  "testing",
  "style",
  "other",
])

export type Severity = z.infer<typeof severitySchema>
export type Category = z.infer<typeof categorySchema>

export const reviewFindingSchema = z.object({
  title: z.string(),
  severity: severitySchema,
  category: categorySchema,
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  description: z.string(),
  suggestion: z.string().optional(),
})

export const reviewResultSchema = z.object({
  summary: z.string().optional(),
  estimatedEffort: z.number().int().min(1).max(5).optional(),
  hasTests: z.boolean().optional(),
  securityConcerns: z.array(z.string()).optional(),
  canBeSplit: z.string().optional(),
  findings: z.array(reviewFindingSchema),
})

export const prTypeSchema = z.enum([
  "bugfix",
  "enhancement",
  "docs",
  "tests",
  "refactor",
  "chore",
  "other",
])

export const walkthroughEntrySchema = z.object({
  path: z.string(),
  summary: z.string(),
})

export const describeResultSchema = z.object({
  summary: z.string(),
  prTypes: z.array(prTypeSchema).optional(),
  labels: z.array(z.string()).optional(),
  changedAreas: z.array(z.string()),
  walkthrough: z.array(walkthroughEntrySchema).optional(),
  notableDetails: z.array(z.string()),
  suggestedTestFocus: z.array(z.string()),
})

export const improvementKindSchema = z.enum([
  "bug",
  "enhancement",
  "performance",
  "maintainability",
  "readability",
  "best-practice",
  "other",
])

export const improvementSchema = z.object({
  title: z.string(),
  kind: improvementKindSchema.optional(),
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  description: z.string(),
  existingCode: z.string().optional(),
  suggestedCode: z.string().optional(),
})

export const improveResultSchema = z.object({
  suggestions: z.array(improvementSchema),
})

export const allResultSchema = z.object({
  description: describeResultSchema,
  review: reviewResultSchema,
  improvements: improveResultSchema,
})

export type ReviewFinding = z.infer<typeof reviewFindingSchema>
export type ReviewResult = z.infer<typeof reviewResultSchema>
export type DescribeResult = z.infer<typeof describeResultSchema>
export type Improvement = z.infer<typeof improvementSchema>
export type ImproveResult = z.infer<typeof improveResultSchema>
export type AllResult = z.infer<typeof allResultSchema>

const SCHEMAS = {
  describe: describeResultSchema,
  review: reviewResultSchema,
  improve: improveResultSchema,
  all: allResultSchema,
} as const

export function resultSchemaFor(command: RebotCommand) {
  return SCHEMAS[command]
}

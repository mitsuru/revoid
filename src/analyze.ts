import type { ZodType } from "zod"
import { runModelObject, type RunModelObjectDeps } from "./model"
import { renderResult } from "./render"
import { resultSchemaFor } from "./schema"
import { createContextTools } from "./tools"
import type { RebotCommand } from "./types"

export interface AnalyzeDeps extends RunModelObjectDeps {
  /** Repository root for context tools. Defaults to the current working directory. */
  cwd?: string
  /** Enable repository context tools (read_file/grep). Defaults to true. */
  context?: boolean
}

/**
 * Runs a command end-to-end: gives the model repository context tools, builds a
 * schema-validated structured result, then renders it to Markdown.
 */
export async function analyze(
  command: RebotCommand,
  prompt: string,
  deps: AnalyzeDeps = {},
): Promise<string> {
  const { cwd, context, ...modelDeps } = deps
  const useContext = context ?? true

  const runDeps: RunModelObjectDeps = { ...modelDeps }
  if (!runDeps.tools && useContext) {
    runDeps.tools = createContextTools(cwd ?? process.cwd())
  }

  const schema = resultSchemaFor(command) as ZodType
  const result = await runModelObject(prompt, schema, runDeps)
  return renderResult(command, result)
}

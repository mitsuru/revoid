import { runModel, type RunModelDeps } from "./model"
import { withContextGuidance } from "./prompts"
import { createContextTools } from "./tools"

export interface AskDeps extends RunModelDeps {
  /** Repository root for context tools. Defaults to the current working directory. */
  cwd?: string
  /** Enable repository context tools (read_file/grep). Defaults to true. */
  context?: boolean
}

/**
 * Answers a question about a pull request as free-form Markdown. Gives the model
 * repository context tools (unless disabled) so it can read beyond the diff.
 */
export async function ask(prompt: string, deps: AskDeps = {}): Promise<string> {
  const { cwd, context, ...modelDeps } = deps
  const useContext = context ?? true

  const runDeps: RunModelDeps = { ...modelDeps }
  if (!runDeps.tools && useContext) {
    runDeps.tools = createContextTools(cwd ?? process.cwd())
  }

  const finalPrompt = runDeps.tools ? withContextGuidance(prompt) : prompt
  const result = await runModel(finalPrompt, runDeps)
  return result.markdown
}

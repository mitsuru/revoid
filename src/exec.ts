import { spawn } from "node:child_process"

export type ExecCommand = (command: string, args: string[]) => Promise<string>

export const execCommand: ExecCommand = async (command, args) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (error) => {
      reject(new Error(`Failed to run ${command}: ${error.message}`))
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${stderr.trim()}`))
    })
  })
}

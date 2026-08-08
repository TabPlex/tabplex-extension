export class BackupValidationError extends Error {
  readonly code: string
  readonly path: string

  constructor(code: string, path = "$") {
    super(`${code}:${path}`)
    this.name = "BackupValidationError"
    this.code = code
    this.path = path
  }
}

export class TardisError extends Error {
  constructor(
    message: string,
    public file: string = 'unknown',
    public line: number = 0,
    public col: number = 0,
  ) {
    super(
      `\nTardisError: ${file} line ${line} col ${col}\n  ${message}\n`
    )
    this.name = 'TardisError'
  }
}
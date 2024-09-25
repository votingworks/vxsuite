export class DiagnosticError extends Error {
  constructor(message: string, options?: { originalError?: Error }) {
    super(message, { cause: options?.originalError });
  }
}

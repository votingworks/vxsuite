/**
 * Thrown when a file itself could not be read, e.g. EIO from a failing disk.
 * Wrapped in its own class so that a caller doing something with each chunk can
 * tell a failure of the source from a failure of its own, which are otherwise
 * indistinguishable once both have been thrown out of the same loop.
 */
export class ReadChunkError extends Error {
  constructor(private readonly error: globalThis.Error) {
    super(error.message);
  }

  /**
   * The error the file system actually raised.
   */
  get readError(): globalThis.Error {
    return this.error;
  }
}

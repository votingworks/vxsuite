/**
 * Thrown once a file has produced more bytes than a caller allowed it to. The
 * limit itself is not carried along: whoever set it already has it, and by
 * definition we never learned how big the file actually was.
 */
export class FileExceedsMaxSizeError extends Error {
  constructor(maxSize: number) {
    super(`file is larger than the maximum of ${maxSize} bytes`);
  }
}

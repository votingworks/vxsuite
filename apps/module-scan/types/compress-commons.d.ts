declare module 'compress-commons' {
  import { Stream } from 'stream'
  import { Transform, TransformOptions } from 'readable-stream'

  export abstract class ArchiveEntry {
    abstract getName(): string
    abstract getSize(): number
    abstract getLastModifiedDate(): Date
    abstract isDirectory(): boolean
  }

  export class ZipArchiveEntry extends ArchiveEntry {}

  export type ArchiveOutputStreamOptions = TransformOptions

  export abstract class ArchiveOutputStream extends Transform {
    constructor(options?: ArchiveOutputStreamOptions)

    entry(
      ae: ArchiveEntry,
      source: Buffer | Stream,
      callback?: (err: Error | null) => void
    ): this
    finish(): void
    getBytesWritten(): number

    on(event: 'close', listener: () => void): this
    on(event: 'data', listener: (chunk: Buffer | string) => void): this
    on(event: 'end', listener: () => void): this
    on(event: 'error', listener: (err: Error) => void): this
    on(event: 'pause', listener: () => void): this
    on(event: 'readable', listener: () => void): this
    on(event: 'resume', listener: () => void): this
  }

  export interface ZipArchiveOutputStreamOptions
    extends ArchiveOutputStreamOptions {
    /**
     * Forces the archive to contain local file times instead of UTC.
     */
    forceLocalTime?: boolean

    /**
     * Forces the archive to contain ZIP64 headers.
     */
    forceZip64?: boolean

    /**
     * Passed to [zlib]{@link https://nodejs.org/api/zlib.html#zlib_class_options} to control compression.
     */
    zlib?: import('zlib').ZlibOptions
  }

  export class ZipArchiveOutputStream extends ArchiveOutputStream {}
}

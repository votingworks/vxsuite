import { Stream } from 'node:stream'
import {
  ArchiveEntry,
  ZipArchiveOutputStream,
  ZipArchiveOutputStreamOptions,
} from 'compress-commons'

declare class ZipStream extends ZipArchiveOutputStream {
  constructor(options?: ZipStream.ZipStreamOptions)

  /**
   * Appends an entry given an input source (text string, buffer, or stream).
   */
  entry(
    entry: ArchiveEntry,
    source: Buffer | Stream,
    callback: (err: Error | null, entry?: ArchiveEntry) => void
  ): this
  entry(
    source: Buffer | Stream | string,
    data: Partial<ZipStream.FileData>,
    callback: (err: Error | null, entry?: ArchiveEntry) => void
  ): this

  /**
   * Finalizes the instance and prevents further appending to the archive
   * structure (queue will continue til drained).
   */
  finalize(): void
}

declare namespace ZipStream {
  interface FileData {
    type: 'file' | 'directory' | 'symlink'
    name: string
    linkname: string | null
    date: Date
    mode: number
    store: boolean
    comment: string
  }

  interface ZipStreamOptions extends ZipArchiveOutputStreamOptions {
    /**
     * Sets the zip archive comment.
     */
    comment?: string

    /**
     * Sets the compression method to STORE.
     */
    store?: boolean
  }
}

export = ZipStream

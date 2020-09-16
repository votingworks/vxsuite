declare module 'zip-stream' {
  import { Stream } from 'stream'
  import {
    ZipArchiveOutputStream,
    ZipArchiveOutputStreamOptions,
  } from 'compress-commons'

  export interface FileData {
    type: 'file' | 'directory' | 'symlink'
    name: string
    linkname: string | null
    date: Date
    mode: number
    store: boolean
    comment: string
  }

  export interface ZipStreamOptions extends ZipArchiveOutputStreamOptions {
    /**
     * Sets the zip archive comment.
     */
    comment?: string

    /**
     * Sets the compression method to STORE.
     */
    store?: boolean
  }

  class ZipStream extends ZipArchiveOutputStream {
    constructor(options?: ZipStreamOptions)

    /**
     * Appends an entry given an input source (text string, buffer, or stream).
     */
    entry(
      source: Buffer | Stream | string,
      data: Partial<FileData>,
      callback: (err: Error, entry: Entry) => void
    ): this

    /**
     * Finalizes the instance and prevents further appending to the archive
     * structure (queue will continue til drained).
     */
    finalize(): void
  }

  export = ZipStream
}

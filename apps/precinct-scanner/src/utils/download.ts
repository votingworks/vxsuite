import { err, ok, Result } from '@votingworks/types'
import { join } from 'path'

/**
 * Extract the filename from a `Content-Disposition` header.
 *
 * @example
 *
 * readContentDispositionFilename('Content-Disposition: attachment; filename="cool.html"')
 * // returns 'cool.html'
 *
 * readContentDispositionFilename('Content-Disposition: attachment')
 * // returns undefined
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition
 */
export function readContentDispositionFilename(
  header: string
): string | undefined {
  const match = header.match(/filename=(?:"([^"]+)"|(\S+))\s*$/)

  if (match) {
    const [, quoted, unquoted] = match
    return quoted || unquoted
  }
}

export enum DownloadErrorKind {
  FetchFailed = 'FetchFailed',
  FileMissing = 'FileMissing',
  OpenFailed = 'OpenFailed',
  NoFileChosen = 'NoFileChosen',
}

export type DownloadError =
  | { kind: DownloadErrorKind.FetchFailed; response: Response }
  | { kind: DownloadErrorKind.FileMissing; response: Response }
  | { kind: DownloadErrorKind.OpenFailed; path: string; error: Error }
  | { kind: DownloadErrorKind.NoFileChosen }

/**
 * Download data from `url`. By default, this will either use the browser's
 * native download functionality or show kiosk-browser's file picker. If inside
 * kiosk-browser, a target directory may be specified for a UI-less experience.
 */
export async function download(
  url: string,
  { into: directory }: { into?: string } = {}
): Promise<Result<void, DownloadError>> {
  if (window.kiosk) {
    return kioskDownload(window.kiosk, url, directory)
  }

  window.location.assign(url)
  return ok()
}

async function kioskDownload(
  kiosk: KioskBrowser.Kiosk,
  url: string,
  directory?: string
): Promise<Result<void, DownloadError>> {
  const abortController = new AbortController()
  const response = await fetch(url, { signal: abortController.signal })

  if (response.status !== 200) {
    return err({ kind: DownloadErrorKind.FetchFailed, response })
  }

  const contentDisposition = response.headers.get('content-disposition')
  const filename =
    contentDisposition && readContentDispositionFilename(contentDisposition)

  if (!filename) {
    return err({ kind: DownloadErrorKind.FileMissing, response })
  }

  const { body } = response

  if (!body) {
    abortController.abort()
    return err({ kind: DownloadErrorKind.FileMissing, response })
  }

  let downloadTarget: KioskBrowser.FileWriter
  if (directory) {
    await kiosk.makeDirectory(directory, { recursive: true })
    const path = join(directory, filename)
    try {
      downloadTarget = await kiosk.writeFile(path)
    } catch (error) {
      return err({ kind: DownloadErrorKind.OpenFailed, path, error })
    }
  } else {
    try {
      const saveAsTarget = await kiosk.saveAs({ defaultPath: filename })

      if (!saveAsTarget) {
        return err({ kind: DownloadErrorKind.NoFileChosen })
      }

      downloadTarget = saveAsTarget
    } catch (error) {
      return err({ kind: DownloadErrorKind.OpenFailed, path: filename, error })
    }
  }

  /* istanbul ignore next - fetch-mock does not support fetch Readable/WritableStream APIs */
  if (typeof body.pipeTo === 'function') {
    await new Promise<void>((resolve, reject) => {
      body.pipeTo(
        new WritableStream({
          abort(error) {
            reject(error)
          },

          write(chunk) {
            downloadTarget.write(chunk)
          },

          close() {
            downloadTarget.end()
            resolve()
          },
        })
      )
    })
  } else {
    await downloadTarget.write((body as unknown) as Uint8Array)
    await downloadTarget.end()
  }

  return ok()
}

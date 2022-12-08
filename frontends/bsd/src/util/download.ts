export interface Options {
  defaultPath?: string;
}

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
function readContentDispositionFilename(header: string): string | undefined {
  const match = header.match(/filename=(?:"([^"]+)"|(\S+))\s*$/);

  if (match) {
    const [, quoted, unquoted] = match;
    return quoted || unquoted;
  }
}

/**
 * Download a file to disk using kiosk browser.
 */
/* istanbul ignore next - test this once fetch-mock and jsdom support streaming fetch APIs */
async function kioskDownload(
  kiosk: KioskBrowser.Kiosk,
  url: string,
  { defaultPath }: Options = {}
): Promise<void> {
  const controller = new AbortController();
  const { headers, body } = await fetch(url, { signal: controller.signal });

  if (!body) {
    controller.abort();
    throw new Error('response has no body');
  }

  const contentDispositionHeader = headers.get('content-disposition');
  const downloadTarget = await kiosk.saveAs({
    defaultPath:
      (contentDispositionHeader &&
        readContentDispositionFilename(contentDispositionHeader)) ||
      defaultPath,
  });

  if (!downloadTarget) {
    controller.abort();
    throw new Error('no file was chosen');
  }

  // For tests - fetch-mock does not support fetch Readable/WritableStream APIs
  if (typeof body.pipeTo !== 'function') {
    await downloadTarget.write(body as unknown as Uint8Array);
    await downloadTarget.end();
    return;
  }

  await body.pipeTo(
    new WritableStream({
      abort: (error) => {
        throw error;
      },

      async write(chunk) {
        await downloadTarget.write(chunk);
      },

      async close() {
        await downloadTarget.end();
      },
    })
  );
}

function browserDownload(url: string) {
  const anchorElement = document.createElement('a');
  anchorElement.href = url;
  anchorElement.download = '';
  anchorElement.style.display = 'none';
  document.body.appendChild(anchorElement);
  anchorElement.click();
  document.body.removeChild(anchorElement);
}

/**
 * Download a file from a URL. The server is expected to return a response with
 * `Content-Disposition: attachment`.
 */
export async function download(
  url: string,
  options: Options = {}
): Promise<void> {
  if (!window.kiosk) {
    browserDownload(url);
  } else {
    await kioskDownload(window.kiosk, url, options);
  }
}

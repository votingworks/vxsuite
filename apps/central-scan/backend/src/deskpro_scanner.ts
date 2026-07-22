import { deferredQueue, Optional, sleep } from '@votingworks/basics';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { ImageData } from 'canvas';
import makeDebug from 'debug';
import { Buffer } from 'node:buffer';
import { dirSync } from 'tmp';
import WebSocket from 'ws';
import assert from 'node:assert';
import {
  BatchControl,
  BatchScanner,
  ScannedSheetInfo,
  ScanOptions,
} from './fujitsu_scanner';

const debug = makeDebug('scan:deskpro');

// PoC: the Windows 11 VM running the SCAMAX `scanserver` (TWAIN bridge).
// The server streams a duplex capture over a WebSocket as (JSON meta frame,
// raw BMP frame) pairs per page.
function requireDeskProHost(): string {
  const value = process.env['DESKPRO_HOST'];
  assert(
    typeof value === 'string',
    'Missing DESKPRO_HOST environment variable'
  );
  return value;
}
const DESKPRO_PORT = 8765;

/**
 * Decodes the uncompressed BMP (native TWAIN DIB) that the scanserver streams
 * into RGBA `ImageData`. Handles 8-bit (grayscale palette) and 24-bit BMPs,
 * which covers the server's `mode=gray|bw` and `mode=color`.
 */
export function bmpToImageData(buf: Buffer): ImageData {
  const dataOffset = buf.readUInt32LE(10); // BITMAPFILEHEADER.bfOffBits
  const headerSize = buf.readUInt32LE(14); // BITMAPINFOHEADER.biSize
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bitCount = buf.readUInt16LE(28);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0; // positive height => rows stored bottom-to-top
  const rowSize = Math.floor((bitCount * width + 31) / 32) * 4; // padded to 4 bytes
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (bitCount === 8) {
    const paletteOffset = 14 + headerSize; // palette entries are B,G,R,reserved
    for (let y = 0; y < height; y += 1) {
      const srcY = bottomUp ? height - 1 - y : y;
      const row = dataOffset + srcY * rowSize;
      for (let x = 0; x < width; x += 1) {
        const gray = buf[paletteOffset + buf[row + x] * 4]; // grayscale => channels equal
        const o = (y * width + x) * 4;
        rgba[o] = gray;
        rgba[o + 1] = gray;
        rgba[o + 2] = gray;
        rgba[o + 3] = 255;
      }
    }
  } else if (bitCount === 24) {
    for (let y = 0; y < height; y += 1) {
      const srcY = bottomUp ? height - 1 - y : y;
      const row = dataOffset + srcY * rowSize;
      for (let x = 0; x < width; x += 1) {
        const p = row + x * 3; // stored B,G,R
        const o = (y * width + x) * 4;
        rgba[o] = buf[p + 2];
        rgba[o + 1] = buf[p + 1];
        rgba[o + 2] = buf[p];
        rgba[o + 3] = 255;
      }
    }
  } else {
    throw new Error(`unsupported BMP bit count: ${bitCount}`);
  }

  return new ImageData(rgba, width, height);
}

export interface DeskProScannerOptions {
  host?: string;
  mode?: 'gray' | 'color' | 'bw';
  dpi?: number;
  logger: BaseLogger;
}

/**
 * Scans duplex images in batch mode from an InoTec SCAMAX DeskPro, via the
 * WebSocket capture stream exposed by `scanserver` on the Windows VM.
 *
 * The scanner pushes the whole stack continuously once a capture starts; pages
 * arrive front/back/front/back. We decode each BMP to `ImageData`, pair
 * consecutive pages into sheets, and feed them to the importer one sheet at a
 * time.
 *
 * Mid-batch stop on an unreadable ballot: central-scan pauses by no longer
 * pulling sheets (see `Importer.scanOneSheet`) and calls `pauseFeeding`. Because
 * the DeskPro push-streams, "stop pulling" alone does not halt the rollers, so
 * `pauseFeeding` sends the scanserver a `stop` (device does `CancelAll`) to halt
 * the physical feed within the scanner's mechanical stop distance. Crucially
 * this does NOT end the central-scan batch: the hopper may still hold sheets, so
 * when the operator adjudicates and continues, the next `scanSheet` -- once the
 * already-buffered lead sheets are drained -- opens a fresh capture stream (a new
 * TWAIN batch on the scanner) to feed the remainder. The batch ends only when a
 * capture completes naturally with an empty feeder.
 */
export class DeskProScanner implements BatchScanner {
  private readonly host: string;
  private readonly mode: 'gray' | 'color' | 'bw';
  private readonly dpi: number;
  private readonly logger: BaseLogger;

  constructor({
    host,
    mode = 'gray',
    dpi = 200,
    logger,
  }: DeskProScannerOptions) {
    this.host = host ?? requireDeskProHost();
    this.mode = mode;
    this.dpi = dpi;
    this.logger = logger;
  }

  // PoC: assume the bridge is reachable. A real impl could poll GET /status.
  isAttached(): boolean {
    return true;
  }

  isImprinterAttached(): Promise<boolean> {
    return Promise.resolve(false);
  }

  scanSheets({ directory = dirSync().name }: ScanOptions = {}): BatchControl {
    const url = `ws://${this.host}:${DESKPRO_PORT}/capture/stream?duplex=true&mode=${this.mode}&dpi=${this.dpi}`;
    const results = deferredQueue<Optional<ScannedSheetInfo>>();

    // Batch-wide state, shared across the (possibly several) capture streams that
    // make up one central-scan batch when adjudication pauses interrupt it.
    let ws: WebSocket | undefined;
    let captureActive = false; // a capture stream is currently open + feeding
    let stopRequested = false; // WE asked the current capture to stop (pause/endBatch)
    let feederEmpty = false; // a capture ended naturally -> the stack is exhausted
    let batchDone = false; // endBatch called or a fatal error occurred
    let captureSeq = 0; // which capture within this batch (>1 == a resume)
    // Page writes are async; chain them so pages are paired in arrival order.
    // Batch-scoped (one capture active at a time) so a pause can flush it before
    // draining the buffer.
    let chain: Promise<void> = Promise.resolve();

    // The queue can only be settled once; guard so an error path (rejectAll)
    // followed by endBatch (resolveAll), or a double completion, can't throw.
    let settled = false;
    function settleAll(value?: ScannedSheetInfo) {
      if (settled) return;
      settled = true;
      results.resolveAll(value);
    }
    function rejectAll(error: Error) {
      if (settled) return;
      settled = true;
      batchDone = true;
      captureActive = false;
      results.rejectAll(error);
    }

    // The scanserver holds one TWAIN session: `StartCapture` throws "busy" until
    // the prior capture is fully torn down, and it sets itself idle only *after*
    // closing the socket -- so the client can observe the close and reconnect a
    // beat too early. Poll /status until idle before opening a capture.
    const statusUrl = `http://${this.host}:${DESKPRO_PORT}/status`;
    async function waitForIdle(): Promise<void> {
      for (let i = 0; i < 40 && !batchDone; i += 1) {
        try {
          const res = await fetch(statusUrl);
          const { state } = (await res.json()) as { state?: string };
          if (state === 'idle') return;
        } catch {
          // bridge momentarily unreachable; retry
        }
        await sleep(250); // ~10s ceiling, then let StartCapture error clearly
      }
    }

    const openCapture = () => {
      captureSeq += 1;
      void this.logger.log(LogEventId.FujitsuScanInit, 'system', {
        message:
          captureSeq === 1
            ? `DeskPro: opening capture stream ${url} -> ${directory}`
            : `DeskPro: resume -- opening capture #${captureSeq} for the rest of the stack`,
      });
      captureActive = true;
      stopRequested = false;
      chain = Promise.resolve();
      const sock = new WebSocket(url);
      ws = sock;

      const pages: Array<{ data: Buffer; side: string }> = [];
      let pendingMeta: { side?: string } | undefined;
      let pageCount = 0;
      let ended = false;
      let doneSeen = false;

      function endCapture() {
        if (ended) return;
        ended = true;
        captureActive = false;
        if (stopRequested) {
          // Ended because we stopped it (adjudication pause / endBatch), not
          // because the hopper emptied. Leave the batch open: `scanSheet` opens
          // a fresh capture for the rest of the stack once the buffer drains.
          return;
        }
        // Natural completion => feeder empty => the batch is done.
        feederEmpty = true;
        chain = chain.then(() => settleAll(undefined));
      }

      sock.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (!isBinary) {
          const text = data.toString();
          if (text.includes('"done"')) {
            debug('deskpro capture done: %s', text);
            doneSeen = true;
            endCapture();
          } else if (text.includes('"error"')) {
            rejectAll(new Error(`deskpro scanserver error: ${text}`));
          } else {
            pendingMeta = JSON.parse(text);
          }
          return;
        }

        const meta = pendingMeta;
        pendingMeta = undefined;
        chain = chain.then(() => {
          pageCount += 1;
          const side = meta?.side ?? (pageCount % 2 === 1 ? 'front' : 'back');
          pages.push({ data: data as Buffer, side });
          if (pages.length % 2 === 0) {
            const [a, b] = pages.slice(-2);
            const front = a.side === 'back' ? b : a;
            const back = front === a ? b : a;
            results.resolve({
              front: bmpToImageData(front.data),
              back: bmpToImageData(back.data),
            });
          }
        });
      });

      sock.on('error', (error) => rejectAll(error));
      sock.on('close', () => {
        // A close is only a natural end-of-batch if the server said "done" (or
        // we asked it to stop). Anything else -- a watchdog restart, a crashed
        // scanserver, a dropped connection -- means sheets may remain in the
        // feeder, so surface an ERROR rather than letting the batch pause as
        // "tray empty" with paper still in the tray.
        if (!ended && !stopRequested && !doneSeen) {
          ended = true;
          rejectAll(
            new Error(
              'capture stream closed unexpectedly mid-batch (scanserver ' +
                'restarted or connection lost); unscanned sheets may remain ' +
                'in the feeder'
            )
          );
          return;
        }
        endCapture();
      });
    };

    // Send the current capture a `stop` and wait for it to close, so the feed
    // has actually halted (and the TWAIN session is idle for a later capture)
    // before we return. Bounded so it can never hang.
    async function stopCurrentCapture(): Promise<void> {
      stopRequested = true;
      const sock = ws;
      if (!sock || sock.readyState !== WebSocket.OPEN) return;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 5000); // hard cap so this can't hang
        sock.once('close', () => {
          clearTimeout(t);
          resolve();
        });
        sock.send('stop', () => {
          // frame written; server will CancelAll, drain, send done, and close
        });
      });
    }

    return {
      scanSheet: async (): Promise<ScannedSheetInfo | undefined> => {
        // Open a capture when none is running and there's nothing buffered to
        // hand back: the first call of the batch, or a resume after an
        // adjudication pause drained the lead sheets left over from the stop.
        // (While a capture is active, or buffered sheets remain, just drain.)
        if (!batchDone && !feederEmpty && !captureActive && results.isEmpty()) {
          await waitForIdle();
          openCapture();
        }
        return results.get();
      },

      // Halt the physical feed on an adjudication pause WITHOUT ending the batch.
      pauseFeeding: async (): Promise<void> => {
        if (!captureActive) return;
        void this.logger.log(LogEventId.FujitsuScanBatchComplete, 'system', {
          message:
            'DeskPro: sheet needs adjudication -- sending stop to halt the feed',
          disposition: 'success',
        });
        await stopCurrentCapture();

        // Discard every sheet the scanner imaged AFTER the flagged one (the
        // pages that coasted out before the feed halted). They are un-pulled, so
        // dropping them from the buffer keeps them uncounted -- the operator
        // moves those physical sheets from the output tray back to the input
        // tray, and they are re-scanned by the next capture on resume. Without
        // this, the imaged coast sheets would be counted from the buffer AND
        // re-scanned from paper (double-counted), while any sheets that coasted
        // past the imaging point were never captured at all -- an unauditable mix.
        await chain; // let all received frames land in the queue first
        let dropped = 0;
        while (!results.isEmpty()) {
          await results.get();
          dropped += 1;
        }
        void this.logger.log(LogEventId.FujitsuScanBatchComplete, 'system', {
          message: `DeskPro: feed halted; dropped ${dropped} buffered sheet(s) that coasted past the flagged sheet -- reload them (and any not imaged) into the input tray before continuing`,
          disposition: 'success',
        });
      },

      endBatch: async (): Promise<void> => {
        await stopCurrentCapture();
        batchDone = true;
        settleAll(undefined);
        try {
          ws?.close();
        } catch {
          // ignore
        }
      },
    };
  }
}

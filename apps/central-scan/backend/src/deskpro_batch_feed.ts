import {
  deferredQueue,
  err,
  ok,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  ControlType,
  type DaemonEvent,
  type ScannedImage,
  type ScannerClient,
  ScannerState,
  ScanSide,
} from '@votingworks/deskpro-scanner';
import type { EncodedImage } from '@votingworks/types';
import type {
  BatchScannerError,
  BatchScannerErrorCode,
  ScannedSheetInfo,
} from './batch_scanner.js';

/** How long to wait for trailing images once the scanner reports the batch is over. */
export const DEFAULT_BATCH_END_GRACE_MS = 1_000;

type SheetResult = Result<ScannedSheetInfo | undefined, BatchScannerError>;

function scanErrorCode(controlType: number): BatchScannerErrorCode {
  switch (controlType) {
    case ControlType.ScanErrorInterlock:
      return 'cover_open';
    case ControlType.ScanErrorPaperJam:
    case ControlType.ScanErrorDoubleFeed:
      return 'jammed';
    default:
      return 'scan_failed';
  }
}

function isScanError(controlType: number): boolean {
  return (
    controlType >= ControlType.ScanErrorUnknown &&
    controlType <= ControlType.ScanErrorDoubleFeed
  );
}

/**
 * Pairs a session's images into sheets and ends the batch once the scanner has
 * scanned, emptied its feeder and gone ready again.
 */
export class DeskProBatchFeed {
  private readonly sheets = deferredQueue<SheetResult>();
  private readonly fronts = new Map<number, EncodedImage>();
  private readonly backs = new Map<number, EncodedImage>();
  private settled = false;
  private scanning = false;
  private ended = false;
  private sawScanning = false;
  private feederEmpty = false;
  private ready = false;
  private endTimer?: NodeJS.Timeout;
  private readonly batchEndGraceMs: number;

  constructor(client: ScannerClient, batchEndGraceMs: number) {
    this.batchEndGraceMs = batchEndGraceMs;
    client.on('image', (image) => this.onImage(image));
    client.on('event', (event) => this.onEvent(event));
    client.on('close', (reason) =>
      this.fail('scan_failed', `DeskPro daemon exited: ${reason}`)
    );
  }

  /** Whether the scanner may still be feeding sheets, including after a failure. */
  isScanning(): boolean {
    return this.scanning && !this.ended;
  }

  /** Marks the feed started, once the scanner has accepted `scanStart`. */
  started(): void {
    this.scanning = true;
  }

  /** Ends the feed, failing it if a sheet is missing a side. */
  finish(): void {
    this.ended = true;
    const [unpaired] = [...this.fronts.keys(), ...this.backs.keys()];
    if (unpaired !== undefined) {
      this.fail(
        'scan_failed',
        `DeskPro sent only one side of sheet ${unpaired}`
      );
      return;
    }
    this.settle(ok(undefined));
  }

  next(): Promise<SheetResult> {
    return this.sheets.get();
  }

  private onImage({ header, data }: ScannedImage): void {
    if (this.settled) return;
    // TODO: reject sheets whose header reports `doubleFeed` or a failed
    // `integrity`, once we've seen what values good sheets report.
    const image: EncodedImage = { encoded: data };
    switch (header.scanSide) {
      case ScanSide.Front:
        this.fronts.set(header.seqId, image);
        break;
      case ScanSide.Back:
        this.backs.set(header.seqId, image);
        break;
      default:
        this.fail(
          'scan_failed',
          `DeskPro sent an image for unknown side ${header.scanSide}`
        );
        return;
    }
    const front = this.fronts.get(header.seqId);
    const back = this.backs.get(header.seqId);
    if (front && back) {
      this.fronts.delete(header.seqId);
      this.backs.delete(header.seqId);
      this.sheets.resolve(ok({ images: [front, back] }));
    }
  }

  private onEvent(event: DaemonEvent): void {
    switch (event.kind) {
      case 'control':
        this.onControl(event);
        break;
      case 'disconnected':
        this.fail('scan_failed', `DeskPro disconnected: ${event.message}`);
        break;
      case 'oversizedImage':
      case 'incompatibleImage':
        this.fail(
          'scan_failed',
          `DeskPro sent an unusable image (${event.kind})`
        );
        break;
      case 'log':
      case 'operationalState':
        break;
      default:
        throwIllegalValue(event, 'kind');
    }
  }

  private onControl({
    controlType,
    numData,
    strData,
  }: Extract<DaemonEvent, { kind: 'control' }>): void {
    if (isScanError(controlType)) {
      this.fail(
        scanErrorCode(controlType),
        `DeskPro reported scan error ${controlType} (scanner code ${strData})`
      );
      return;
    }
    switch (controlType) {
      case ControlType.Error:
        if (numData !== 0) {
          this.fail('scan_failed', `DeskPro driver error ${numData}`);
        }
        return;
      case ControlType.Status:
        this.ready = numData === ScannerState.Ready;
        this.sawScanning ||= numData === ScannerState.Scanning;
        break;
      case ControlType.Feeder:
        this.feederEmpty = numData === 0;
        break;
      default:
        return;
    }
    if (this.sawScanning && this.feederEmpty && this.ready) {
      // TODO: wait for a signal that every image has arrived (e.g.
      // `getStatus().imagesAvailable` reaching 0) instead of a fixed grace period.
      this.endTimer ??= setTimeout(() => this.finish(), this.batchEndGraceMs);
    } else {
      clearTimeout(this.endTimer);
      this.endTimer = undefined;
    }
  }

  private fail(code: BatchScannerErrorCode, message: string): void {
    this.settle(err({ code, message }));
  }

  private settle(result: SheetResult): void {
    if (this.settled) return;
    this.settled = true;
    clearTimeout(this.endTimer);
    this.sheets.resolveAll(result);
  }
}

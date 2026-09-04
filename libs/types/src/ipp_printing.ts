/**
 * A PDF-to-PostScript renderer supported by the CUPS `pdftops` filter, selected
 * via its `pdftops-renderer` option. See {@link PrinterConfig.pdfRenderer}.
 */
export type PdfRenderer = 'gs' | 'pdftops';

export interface PrinterConfig {
  label: string;
  vendorId: number;
  productId: number;
  baseDeviceUri: string;
  ppd: string;
  /**
   * Whether the printer supports IPP (Internet Printing Protocol). When a
   * printer supports IPP, we can use the IPP protocol to query the printer for
   * its status beyond just whether it's connected or not.
   */
  supportsIpp: boolean;
  /**
   * Which renderer CUPS should use to convert PDFs to PostScript for this
   * printer. Omit to use the CUPS default, Ghostscript.
   *
   * Ghostscript's `ps2write` re-asserts the page device on every page for any
   * paper size other than its built-in default of letter. A mid-job
   * `setpagedevice` ends the current sheet, which breaks duplex sheet pairing:
   * the duplexer engages and the sheet takes the duplex path, but each page
   * lands on a fresh sheet front and the backs come out blank. The job silently
   * comes out single-sided, with no error from CUPS. Poppler's `pdftops` only
   * calls `setpagedevice` when the page size actually changes, so the pairing
   * holds.
   *
   * Every paper size is affected except letter, which is Ghostscript's own
   * built-in default. This is independent of the PPD: pinning a different
   * `*DefaultPageSize` does not change which size is exempt.
   *
   * Ending the sheet on a redundant `setpagedevice` is permitted by the
   * PostScript spec, so printers that need `pdftops` are stricter rather than
   * broken; the others ignore the redundant assertion and duplex correctly on
   * the default renderer.
   */
  pdfRenderer?: PdfRenderer;
  /**
   * A PPD `*InputSlot` choice to select explicitly on every print job. Omit to
   * let the printer pick a tray by matching the job's paper size.
   *
   * On some printers — the HP LaserJet Pro M404 is the one we've hit — every
   * input is configured for "Any" size by default, so the printer can't match a
   * job to one of them and instead prompts the operator to load paper and
   * confirm the tray. Naming the slot makes it commit to that tray and skip the
   * prompt. Printers that match on size by themselves need nothing here.
   */
  inputSlot?: string;
}

export type PrinterStatus =
  | {
      connected: false;
    }
  | {
      connected: true;
      config: PrinterConfig;
      /**
       * The rich status of the printer, if the printer supports IPP. The value
       * may be undefined for an IPP printer if it is still being queried.
       */
      richStatus?: PrinterRichStatus;
    };

/**
 * IPP printer-state identifies the basic status of a printer.
 * Spec: https://datatracker.ietf.org/doc/html/rfc2911#section-4.4.11
 */
export type IppPrinterState = 'idle' | 'processing' | 'stopped';

/**
 * IPP printer-state-reasons explain what's going on with a printer in detail.
 * Spec: https://datatracker.ietf.org/doc/html/rfc2911#section-4.4.12
 * There are more possible reasons than covered in the spec, so we just type as string.
 *
 * Note that the actual printer-state-reasons sent by the printer may have a
 * suffix of either: "-report", "-warning", or "-error" (e.g. "media-jam-error").
 */
export type IppPrinterStateReason = string;

/**
 * "Marker" is a general name for ink/toner/etc. CUPS implements a variety of
 * marker-related IPP attributes prefixed with "marker-", e.g. "marker-levels".
 * Each attribute is a comma-delimated list of values, since a printer may have
 * multiple marker supplies (e.g. black and color ink cartridges). Here, we
 * represent the marker info for a single marker supply.
 * Spec: https://www.cups.org/doc/spec-ipp.html
 */
export interface IppMarkerInfo {
  name: string; // e.g. "black cartridge"
  color: string; // e.g. "#000000"
  type: string; // e.g. "toner-cartridge"
  lowLevel: number; // e.g. 2
  highLevel: number; // e.g. 100
  level: number; // e.g. 83
}

/**
 * A collection of status attributes we can get from a printer via IPP.
 */
export interface PrinterRichStatus {
  state: IppPrinterState;
  stateReasons: IppPrinterStateReason[];
  markerInfos: IppMarkerInfo[];
}

/**
 * A CUPS print job identifier, unique per queue. Returned by `lp` on
 * submission and used to query the job's status via IPP.
 */
export type PrintJobId = number;

/**
 * IPP job-state identifies the basic status of a print job.
 * Spec: https://datatracker.ietf.org/doc/html/rfc2911#section-4.3.7
 *
 * `processing-stopped` was not observed in failure testing — disconnects
 * produce `pending-held` under the `retry-job` error policy and `aborted`
 * under `abort-job` — but it is a valid state CUPS may report.
 */
export type IppJobState =
  | 'pending'
  | 'pending-held'
  | 'processing'
  | 'processing-stopped'
  | 'canceled'
  | 'aborted'
  | 'completed';

/**
 * What a print job means to the application, derived from {@link IppJobState}.
 * `sent-to-printer` means CUPS finished transferring the job to the printer.
 * It does not mean the pages have physically printed.
 */
export type PrintJobOutcome = 'in-progress' | 'sent-to-printer' | 'failed';

/**
 * The status of a print job as tracked by `libs/printing`.
 */
export interface PrintJobStatus {
  outcome: PrintJobOutcome;
  /**
   * IPP job-printer-state-message: free-form diagnostic text, empty on
   * success. For display and logging only, never for control flow.
   */
  reason?: string;
}

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

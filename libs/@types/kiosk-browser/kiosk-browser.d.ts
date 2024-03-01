declare namespace KioskBrowser {
  export interface BatteryInfo {
    discharging: boolean;
    level: number; // Number between 0–1
  }

  export type PrintSides =
    /**
     * One page per sheet, aka simplex or "Duplex=None".
     */
    | 'one-sided'

    /**
     * Two pages per sheet, aka "Duplex=DuplexNoTumble". This option prints such
     * that a right-side up portrait sheet flipped over on the long edge remains
     * right-side up, i.e. a regular left-to-right book.
     */
    | 'two-sided-long-edge'

    /**
     * Two pages per sheet, aka "Duplex=DuplexTumble". This option prints such
     * that a right-side up portrait sheet flipped over on the short edge remains
     * right-side up, i.e. a bound-at-the-top ring binder.
     */
    | 'two-sided-short-edge';

  export interface PrintOptions {
    deviceName?: string;
    paperSource?: string;
    copies?: number;
    sides?: PrintSides;
    raw?: { [key: string]: string };
  }

  /**
   * IPP printer-state-reasons explain what's going on with a printer in detail.
   * Spec: https://datatracker.ietf.org/doc/html/rfc2911#section-4.4.12
   * For a partial list of common printer-state-reasons, see
   * getPrinterIppAttributes.ts in kiosk-browser. Since we don't know all
   * possible reasons, we just type as string.
   */
  export type IppPrinterStateReason = string;

  /**
   * "Marker" is a general name for ink/toner/etc. CUPS implements a variety of
   * marker-related IPP attributes prefixed with "marker-", e.g. "marker-levels".
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
   * A collection of status info about a printer we get via IPP.
   */
  export type PrinterIppAttributes =
    | { state: 'unknown' } // We didn't get a response from the printer
    | {
        state: 'idle' | 'processing' | 'stopped';
        stateReasons: IppPrinterStateReason[];
        markerInfos: IppMarkerInfo[];
      };

  interface PrinterInfoBase {
    // Docs: http://electronjs.org/docs/api/structures/printer-info
    description: string;
    isDefault: boolean;
    name: string;
    options?: { [key: string]: string };
    // Added via kiosk-browser
    connected: boolean;
  }
  /**
   * The printer's basic info we get from Electron (e.g. name, description,
   * options), plus its connection status and IPP attributes.
   */
  export type PrinterInfo = PrinterInfoBase & PrinterIppAttributes;

  export interface Device {
    locationId: number;
    vendorId: number;
    productId: number;
    deviceName: string;
    manufacturer: string;
    serialNumber: string;
    deviceAddress: number;
  }

  export interface SaveAsOptions {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    filters?: FileFilter[];
  }

  // Copied from Electron.OpenDialogOptions
  export interface OpenDialogOptions {
    title?: string;
    defaultPath?: string;
    /**
     * Custom label for the confirmation button, when left empty the default label will
     * be used.
     */
    buttonLabel?: string;
    filters?: FileFilter[];
    /**
     * Contains which features the dialog should use. The following values are
     * supported:
     */
    properties?: Array<
      'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'
    >;
  }

  // Copied from Electron.SaveDialogOptions, with Linux relevant options only
  export interface SaveDialogOptions {
    /**
     * The dialog title. Cannot be displayed on some `Linux` desktop environments.
     */
    title?: string;
    /**
     * Absolute directory path, absolute file path, or file name to use by default.
     */
    defaultPath?: string;
    /**
     * Custom label for the confirmation button, when left empty the default label will
     * be used.
     */
    buttonLabel?: string;
    filters?: FileFilter[];
    properties?: Array<'showHiddenFiles' | 'showOverwriteConfirmation'>;
  }

  export interface MakeDirectoryOptions {
    recursive?: boolean;
    mode?: number;
  }

  export interface FileFilter {
    // Docs: http://electronjs.org/docs/api/structures/file-filter
    extensions: string[];
    name: string;
  }

  export enum FileSystemEntryType {
    File = 1, // UV_DIRENT_FILE
    Directory = 2, // UV_DIRENT_DIR
    SymbolicLink = 3, // UV_DIRENT_LINK
    FIFO = 4, // UV_DIRENT_FIFO
    Socket = 5, // UV_DIRENT_SOCKET
    CharacterDevice = 6, // UV_DIRENT_CHAR
    BlockDevice = 7, // UV_DIRENT_BLOCK
  }

  export interface FileSystemEntry {
    readonly name: string;
    readonly path: string;
    readonly type: FileSystemEntryType;
    readonly size: number;
    readonly mtime: Date;
    readonly atime: Date;
    readonly ctime: Date;
  }

  export interface FileWriter {
    /**
     * Writes a chunk to the file. May be called multiple times. Data will be
     * written in the order of calls to `write`.
     */
    write(data: Uint8Array | string): Promise<void>;

    /**
     * Finishes writing to the file and closes it. Subsequent calls to `write`
     * will fail. Resolves when the file is successfully closed.
     */
    end(): Promise<void>;

    filename: string;
  }

  export interface TotpInfo {
    isoDatetime: string;
    code: string;
  }

  export interface Observable<T> {
    subscribe(callback: (value: T) => void): () => void;
  }

  export interface Kiosk {
    print(options?: PrintOptions): Promise<void>;
    getPrinterInfo(): Promise<PrinterInfo[]>;

    /**
     * Prints the current page to PDF and resolves with the PDF file bytes.
     */
    printToPDF(): Promise<Uint8Array>;
    log(message: string): Promise<void>;

    getBatteryInfo(): Promise<BatteryInfo | undefined>;
    devices: Observable<Iterable<Device>>;
    printers: Observable<Iterable<PrinterInfo>>;
    quit(): void;

    /**
     * Opens a Save Dialog to allow the user to choose a destination for a file.
     * Once chosen, resolves with a handle to the file to write data to it.
     */
    saveAs(options?: SaveAsOptions): Promise<FileWriter | undefined>;

    showOpenDialog(options?: OpenDialogOptions): Promise<{
      canceled: boolean;
      filePaths: string[];
    }>;

    showSaveDialog(options?: SaveDialogOptions): Promise<{
      canceled: boolean;
      filePath?: string;
    }>;

    captureScreenshot(): Promise<Buffer>;
  }
}

declare var kiosk: KioskBrowser.Kiosk | undefined;

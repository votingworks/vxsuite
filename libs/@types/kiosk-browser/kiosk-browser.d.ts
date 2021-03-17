declare namespace KioskBrowser {
  export interface BatteryInfo {
    discharging: boolean
    level: number // Number between 0–1
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
    | 'two-sided-short-edge'

  export interface PrintOptions {
    deviceName?: string
    paperSource?: string
    copies?: number
    sides?: PrintSides
  }

  export interface PrinterInfo {
    // Docs: http://electronjs.org/docs/api/structures/printer-info
    description: string
    isDefault: boolean
    name: string
    status: number
    // Added via kiosk-browser
    connected: boolean
    options?: { [key: string]: string }
  }

  export interface Device {
    locationId: number
    vendorId: number
    productId: number
    deviceName: string
    manufacturer: string
    serialNumber: string
    deviceAddress: number
  }

  export interface UsbDrive {
    deviceName: string
    mountPoint?: string
  }

  export interface SaveAsOptions {
    title?: string
    defaultPath?: string
    buttonLabel?: string
    filters?: FileFilter[]
  }

  export interface MakeDirectoryOptions {
    recursive?: boolean
    mode?: number
  }

  export interface FileFilter {
    // Docs: http://electronjs.org/docs/api/structures/file-filter
    extensions: string[]
    name: string
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
    readonly name: string
    readonly path: string
    readonly type: FileSystemEntryType
    readonly size: number
    readonly mtime: Date
    readonly atime: Date
    readonly ctime: Date
  }

  export interface FileWriter {
    /**
     * Writes a chunk to the file. May be called multiple times. Data will be
     * written in the order of calls to `write`.
     */
    write(data: Uint8Array | string): Promise<void>

    /**
     * Finishes writing to the file and closes it. Subsequent calls to `write`
     * will fail. Resolves when the file is successfully closed.
     */
    end(): Promise<void>

    filename: string
  }

  export interface SetClockParams {
    isoDatetime: string
    IANAZone: string
  }

  export interface Kiosk {
    print(options?: PrintOptions): Promise<void>
    getPrinterInfo(): Promise<PrinterInfo[]>

    /**
     * Prints the current page to PDF and resolves with the PDF file bytes.
     */
    printToPDF(): Promise<Uint8Array>

    getBatteryInfo(): Promise<BatteryInfo>
    devices: import('rxjs').Observable<Iterable<Device>>
    quit(): void

    /**
     * Opens a Save Dialog to allow the user to choose a destination for a file.
     * Once chosen, resolves with a handle to the file to write data to it.
     */
    saveAs(options?: SaveAsOptions): Promise<FileWriter | undefined>

    /**
     * Writes a file to a specified file path
     */
    writeFile(path: string): Promise<FileWriter>
    writeFile(path: string, content: Uint8Array | string): Promise<void>

    /*
     * Creates a directory at the specified path.
     */
    makeDirectory(path: string, options?: MakeDirectoryOptions): Promise<void>

    // USB sticks
    getUsbDrives(): Promise<UsbDrive[]>
    mountUsbDrive(device: string): Promise<void>
    unmountUsbDrive(device: string): Promise<void>

    /**
     * Writes a file to a specified file path
     */
    writeFile(path: string): Promise<FileWriter>
    writeFile(path: string, content: Uint8Array | string): Promise<void>

    /**
     * Creates a directory at the specified path.
     */
    makeDirectory(path: string, options?: MakeDirectoryOptions): Promise<void>

    /**
     * Reads the list of files at a specified directory path
     */
    getFileSystemEntries(path: string): Promise<FileSystemEntry[]>

    /**
     * Reads a file from a specified path
     */
    readFile(path: string): Promise<Uint8Array>
    readFile(path: string, encoding: string): Promise<string>

    // storage
    storage: {
      set(key: string, value: unknown): Promise<void>
      get(key: string): Promise<unknown | undefined>
      remove(key: string): Promise<void>
      clear(): Promise<void>
    }

    setClock(params: SetClockParams): Promise<void>
  }
}

declare var kiosk: KioskBrowser.Kiosk | undefined

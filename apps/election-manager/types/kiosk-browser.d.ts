declare namespace KioskBrowser {
  export interface BatteryInfo {
    discharging: boolean
    level: number // Number between 0–1
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

  export interface FileWriter {
    /**
     * Writes a chunk to the file. May be called multiple times. Data will be
     * written in the order of calls to `write`.
     */
    write(data: Buffer | Uint8Array | string): Promise<void>

    /**
     * Finishes writing to the file and closes it. Subsequent calls to `write`
     * will fail. Resolves when the file is successfully closed.
     */
    end(): Promise<void>
  }

  export interface Kiosk {
    print(): Promise<void>
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
    saveAs(): Promise<FileWriter | undefined>

    // USB sticks
    getUsbDrives(): Promise<UsbDrive[]>
    mountUsbDrive(device: string)
    unmountUsbDrive(device: string)
  }
}

// Disable `no-var` because using `var` ensures `kiosk` is a property on
// `globalThis`, which makes it available both as plain `kiosk` and as
// `window.kiosk`. Using `const` or `let`, as eslint suggests, will not make it
// available at all. An alternative would be to add `kiosk` as a property to
// the `Window` interface, but then we couldn't refer to `kiosk` without
// `window`.
// eslint-disable-next-line no-var
declare var kiosk: KioskBrowser.Kiosk | undefined

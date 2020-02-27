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

  export interface Kiosk {
    print(): Promise<void>
    getPrinterInfo(): Promise<PrinterInfo[]>
    getBatteryInfo(): Promise<BatteryInfo>
    devices: import('rxjs').Observable<Iterable<Device>>
    quit(): void
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

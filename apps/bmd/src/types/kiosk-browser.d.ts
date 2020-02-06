declare module 'kiosk-browser' {
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

  export enum ChangeType {
    Add,
    Remove,
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

  export type DeviceChangeListener = (
    changeType: ChangeType,
    device: Device
  ) => void

  export interface Listener<
    A extends unknown[],
    C extends Function = (...args: A) => void
  > {
    remove(): void
  }

  export interface Listeners<
    A extends unknown[],
    C extends Function = (...args: A) => void
  > {
    add(callback: C): Listener<A, C>
    remove(callback: C): void
    trigger(...args: A): void
  }

  export interface Kiosk {
    print(): Promise<void>
    getPrinterInfo(): Promise<PrinterInfo[]>
    getBatteryInfo(): Promise<BatteryInfo>
    getDeviceList(): Promise<Device[]>
    onDeviceChange: Listeners<[ChangeType, Device]>
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
declare var kiosk: import('kiosk-browser').Kiosk | undefined

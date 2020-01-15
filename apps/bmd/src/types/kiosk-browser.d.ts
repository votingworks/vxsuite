declare module 'kiosk-browser' {
  export interface BatteryInfo {
    discharging: boolean
    level: number // Number between 0–1
  }

  export interface Kiosk {
    print(): Promise<void>
    getBatteryInfo(): Promise<BatteryInfo>
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

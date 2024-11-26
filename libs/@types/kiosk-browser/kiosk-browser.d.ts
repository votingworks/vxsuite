declare namespace KioskBrowser {
  export interface Kiosk {
    log(message: string): Promise<void>;
    quit(): void;
  }
}

declare var kiosk: KioskBrowser.Kiosk | undefined;

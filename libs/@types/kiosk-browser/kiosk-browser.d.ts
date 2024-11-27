declare namespace KioskBrowser {
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

  export interface Kiosk {
    log(message: string): Promise<void>;

    quit(): void;

    showOpenDialog(options?: OpenDialogOptions): Promise<{
      canceled: boolean;
      filePaths: string[];
    }>;

    captureScreenshot(): Promise<Uint8Array>;
  }
}

declare var kiosk: KioskBrowser.Kiosk | undefined;

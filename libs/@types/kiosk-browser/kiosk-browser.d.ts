declare namespace KioskBrowser {
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

  export interface Kiosk {
    log(message: string): Promise<void>;

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

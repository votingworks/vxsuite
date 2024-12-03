/**
 * Logs a message to the console. Does not expect a reply.
 */
export interface IpcMessageLog {
  type: 'Log';
  message: string;
}

/**
 * Requests the application to quit. Does not expect a reply.
 */
export interface IpcMessageQuit {
  type: 'Quit';
}

/**
 * Requests a screenshot to be captured. Replies with image data.
 */
export interface IpcMessageCaptureScreenshot {
  type: 'CaptureScreenshot';

  /**
   * A unique identifier for the request.
   */
  replyTo: string;
}

/**
 * Requests to show an option dialog. Replies with the selected file paths.
 */
export interface IpcMessageShowOptionDialog {
  type: 'ShowOpenDialog';

  /**
   * A unique identifier for the request.
   */
  replyTo: string;

  /**
   * The file dialog title.
   */
  title: string;

  /**
   * Optional file filters.
   */
  filters?: readonly FileFilter[];

  /**
   * Whether or not multiple selection is allowed.
   */
  selectMultiple?: boolean;
}

/**
 * A file filter for the file dialog.
 */
export interface FileFilter {
  /**
   * The name of the filter.
   */
  name: string;

  /**
   * The file extensions to filter by.
   */
  extensions: readonly string[];
}

/**
 * A message sent from the webview to the application.
 */
export type IpcMessage =
  | IpcMessageLog
  | IpcMessageQuit
  | IpcMessageCaptureScreenshot
  | IpcMessageShowOptionDialog;

/**
 * The reply to a {@link IpcMessageCaptureScreenshot}.
 */
export interface IpcReplyCaptureScreenshot {
  type: 'CaptureScreenshot';

  /**
   * The `replyTo` value from the request.
   */
  inReplyTo: string;

  /**
   * Base64 encoded PNG image.
   */
  data: string;
}

/**
 * The reply to a {@link IpcMessageShowOptionDialog}.
 */
export interface IpcReplyShowOptionDialog {
  type: 'ShowOpenDialog';

  /**
   * The `replyTo` value from the request.
   */
  inReplyTo: string;

  /**
   * Whether the dialog was canceled.
   */
  canceled: boolean;

  /**
   * The selected file paths.
   */
  filePaths: string[];
}

/**
 * An error reply, when something goes wrong in handling a message.
 */
export interface IpcReplyError {
  type: 'Error';
  message: string;
}

/**
 * The reply to a message.
 */
export type IpcReply =
  | IpcReplyCaptureScreenshot
  | IpcReplyShowOptionDialog
  | IpcReplyError;

declare global {
  interface Window {
    // Made available using `webkit_user_content_manager_register_script_message_handler`.
    webkit: {
      messageHandlers: {
        // `ipc` is the name on the Rust side of the bridge
        ipc: {
          postMessage: (message: string) => void;
        };
      };
    };

    kiosk: {
      /**
       * Logs a message to the console.
       */
      log(message: string): void;

      /**
       * Requests the application to quit.
       */
      quit(): void;

      /**
       * Requests a screenshot to be captured.
       *
       * @returns A promise that resolves with PNG-encoded image data.
       */
      captureScreenshot(): Promise<Uint8Array>;

      /**
       * Requests to show an option dialog.
       *
       * @param options Options for display and file selection.
       */
      showOpenDialog(options: {
        title: string;
        filters?: readonly FileFilter[];
        selectMultiple?: boolean;
      }): Promise<{
        canceled: boolean;
        filePaths: readonly string[];
      }>;
    };
  }

  interface Uint8ArrayConstructor {
    // this exists in the webkit version we use
    fromBase64(base64: string): Uint8Array;
  }
}

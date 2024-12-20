/**
 * Electron has added a `path` attribute to the `File` interface which exposes
 * the file's real path on filesystem. The regular DOM `File` interface does
 * not include the path due to security concerns when browsing the web.
 */
export type ElectronFile = File & { path: string };

/**
 * Package info from `package.json`.
 */
export interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly license?: string;
  readonly main?: string;
  readonly module?: string;
  readonly scripts?: { [name: string]: string };
  readonly dependencies?: { [name: string]: string };
  readonly devDependencies?: { [name: string]: string };
  readonly peerDependencies?: { [name: string]: string };
  readonly packageManager?: string;

  /**
   * Binaries of the package, i.e. `bin` from `package.json`.
   */
  readonly bin?: string | { [name: string]: string };
}

/**
 * Workspace package info.
 */
export interface PnpmPackageInfo {
  /**
   * Absolute path to the package root.
   */
  readonly path: string;

  /**
   * Path to the package root relative to the workspace root.
   */
  readonly relativePath: string;

  /**
   * Name of the package, i.e. `name` from `package.json`.
   */
  readonly name: string;

  /**
   * Version of the package, i.e. `version` from `package.json`.
   */
  readonly version: string;

  /**
   * Main CJS entry point of the package, i.e. `main` from `package.json`.
   * Missing if the package is not a library.
   */
  readonly main?: string;

  /**
   * Main ESM entry point of the package, i.e. `module` from `package.json`.
   * Missing if the package is not a library.
   */
  readonly module?: string;

  /**
   * Original source code entry point of the package, i.e. `src/index.ts`.
   * Missing if the package is not a library.
   */
  readonly source?: string;

  /**
   * The full `package.json` contents.
   */
  readonly packageJson?: PackageJson;

  /**
   * The full `package.json` path.
   */
  readonly packageJsonPath?: string;
}

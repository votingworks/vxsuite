declare namespace NodeJS {
  /**
   * Properties of the running process that may be used in the backend
   */
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly SCAN_ALLOWED_EXPORT_PATTERNS?: string;
    readonly VX_CONFIG_ROOT?: string;
    readonly VX_MACHINE_ID?: string;
  }
}

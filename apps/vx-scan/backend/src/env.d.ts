declare namespace NodeJS {
  export interface ProcessEnv {
    readonly CI?: string;
    readonly MOCK_SCANNER_HTTP?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PLUSTEKCTL_PATH?: string;
    readonly PORT?: string;
    readonly SCAN_ALLOWED_EXPORT_PATTERNS?: string;
    readonly SCAN_WORKSPACE?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_CODE_VERSION?: string;
  }
}

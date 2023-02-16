declare namespace NodeJS {
  export interface ProcessEnv {
    readonly CI?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PORT?: string;
    readonly SCAN_ALLOWED_EXPORT_PATTERNS?: string;
    readonly SCAN_WORKSPACE?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_CODE_VERSION?: string;
    readonly CVR_EXPORT_FORMAT?: 'cdf' | 'vxf';
    readonly SCANNER_MODEL?: 'custom' | 'plustek';
  }
}

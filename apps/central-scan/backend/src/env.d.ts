declare namespace NodeJS {
  export interface ProcessEnv {
    readonly CI?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly FRONTEND_PORT?: string;
    readonly SCAN_WORKSPACE?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_CODE_VERSION?: string;
    readonly VX_CENTRAL_SCAN_ADMIN_HOST?: string;
    readonly MOCK_SCANNER_SHEET_COPIES?: string;
  }
}

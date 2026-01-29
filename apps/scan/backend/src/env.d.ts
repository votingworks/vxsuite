declare namespace NodeJS {
  export interface ProcessEnv {
    readonly CI?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly FRONTEND_PORT?: string;
    readonly PORT?: string;
    readonly SCAN_WORKSPACE?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_CODE_VERSION?: string;
  }
}

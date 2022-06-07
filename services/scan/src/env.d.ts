declare namespace NodeJS {
  export interface ProcessEnv {
    readonly CI?: string;
    readonly MOCK_SCANNER_HTTP?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PORT?: string;
    readonly SCAN_ALWAYS_HOLD_ON_REJECT?: string;
    readonly SCAN_WORKSPACE?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_MACHINE_TYPE?: string;
  }
}

declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly VX_CONFIG_ROOT?: string;
    readonly VX_MACHINE_JURISDICTION?: string;
    readonly VX_MACHINE_TYPE?: 'admin' | 'central-scan' | 'mark' | 'scan';
  }
}

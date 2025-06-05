declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly USE_STRONGSWAN_TPM_KEY?: string;
    readonly VX_CONFIG_ROOT?: string;
    readonly VX_MACHINE_TYPE?:
      | 'admin'
      | 'central-scan'
      | 'mark'
      | 'mark-scan'
      | 'poll-book'
      | 'scan';
  }
}

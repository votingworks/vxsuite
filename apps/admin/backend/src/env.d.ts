declare namespace NodeJS {
  interface ProcessEnv {
    readonly ADMIN_WORKSPACE?: string;
    readonly CVR_IMPORT_FORMAT?: 'vxf' | 'cdf';
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PORT?: string;
    readonly VX_CODE_VERSION?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_MACHINE_JURISDICTION?: string;
  }
}

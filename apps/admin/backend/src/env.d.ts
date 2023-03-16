declare namespace NodeJS {
  interface ProcessEnv {
    readonly ADMIN_WORKSPACE?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PORT?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_CODE_VERSION?: string;
  }
}

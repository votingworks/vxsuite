declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PORT?: string;
    readonly REACT_APP_VX_CODE_VERSION?: string;
    readonly REACT_APP_VX_DEV?: string;
    readonly REACT_APP_VX_MACHINE_ID?: string;
  }
}

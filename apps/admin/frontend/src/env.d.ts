declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly REACT_APP_VX_CODE_VERSION?: string;
    readonly REACT_APP_VX_DEV?: string;
    readonly REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION?: string;
    readonly REACT_APP_VX_ENABLE_WRITE_IN_ADJUDICATION?: string;
    readonly REACT_APP_VX_MACHINE_ID?: string;
  }
}

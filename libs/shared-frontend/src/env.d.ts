declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly REACT_APP_VX_SKIP_PIN_ENTRY?: string;
  }
}

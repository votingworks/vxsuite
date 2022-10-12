declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    REACT_APP_VX_SKIP_PIN_ENTRY?: string;
  }
}

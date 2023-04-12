declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    VX_CONFIG_ROOT?: string;
    VX_MACHINE_PRIVATE_KEY_PASSWORD?: string;
  }
}

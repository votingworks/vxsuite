declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    VX_ADMIN_PRIVATE_KEY_PASSWORD?: string;
    VX_CONFIG_ROOT?: string;
  }
}

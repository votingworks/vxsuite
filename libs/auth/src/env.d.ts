declare namespace NodeJS {
  export interface ProcessEnv {
    CONFIG_DIRECTORY?: string;
    NODE_ENV: 'development' | 'production' | 'test';
    VX_ADMIN_PRIVATE_KEY_PASSWORD?: string;
  }
}

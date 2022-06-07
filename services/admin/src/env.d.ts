declare namespace NodeJS {
  interface ProcessEnv {
    readonly ADMIN_WORKSPACE?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PORT?: string;
  }
}

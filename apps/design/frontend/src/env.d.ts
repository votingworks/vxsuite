declare namespace NodeJS {
  export interface ProcessEnv {
    readonly CI?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly DEPLOY_ENV: 'development' | 'staging' | 'production';
  }
}

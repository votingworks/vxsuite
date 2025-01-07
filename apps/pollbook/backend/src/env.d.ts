declare namespace NodeJS {
  /** process.env typings */
  export interface ProcessEnv {
    readonly CI?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PORT?: string;
    readonly WORKSPACE?: string;
  }
}

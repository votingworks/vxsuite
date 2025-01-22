declare namespace NodeJS {
  /** process.env typings */
  export interface ProcessEnv {
    readonly AUTH0_CLIENT_ID?: string;
    readonly AUTH0_ISSUER_BASE_URL?: string;
    readonly AUTH0_SECRET?: string;
    readonly BASE_URL?: string;
    readonly CI?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PORT?: string;
    readonly WORKSPACE?: string;
  }
}

declare namespace NodeJS {
  /** process.env typings */
  export interface ProcessEnv {
    readonly AUTH_ENABLED?: string;
    readonly AUTH0_CLIENT_ID?: string;
    readonly AUTH0_ISSUER_BASE_URL?: string;
    readonly AUTH0_SECRET?: string;
    readonly BASE_URL?: string;
    readonly CI?: string;
    readonly DEPLOY_ENV: 'development' | 'staging' | 'production';
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly ORG_ID_VOTINGWORKS?: string;
    readonly PORT?: string;
    readonly SENTRY_DSN?: string;
    readonly WORKSPACE?: string;
  }
}

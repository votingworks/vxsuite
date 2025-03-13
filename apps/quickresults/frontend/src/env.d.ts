declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly REACT_APP_VX_SERVER_URL: string;
    readonly REACT_APP_VX_IS_LIVE_MODE: string;
    readonly REACT_APP_VX_ELECTION_HASH: string;
  }
}

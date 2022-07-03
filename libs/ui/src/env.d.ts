declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly REACT_APP_VX_DEV?: string;
    readonly REACT_APP_VX_DISABLE_CARD_READER_CHECK?: string;
  }
}

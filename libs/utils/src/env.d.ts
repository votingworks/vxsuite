declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    REACT_APP_VX_DEV?: string;
    REACT_APP_VX_DISABLE_CARD_READER_CHECK?: string;
  }
}

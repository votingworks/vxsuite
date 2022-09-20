declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    REACT_APP_VX_DEV?: string;
    REACT_APP_VX_DISABLE_CARD_READER_CHECK?: string;
    REACT_APP_VX_ENABLE_WRITE_IN_ADJUDICATION?: string;
    REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION?: string;
    REACT_APP_VX_ENABLE_LIVECHECK?: string;
    REACT_APP_VX_DISALLOW_CASTING_OVERVOTES?: string;
    REACT_APP_VX_ENABLE_REACT_QUERY_DEVTOOLS?: string;
  }
}

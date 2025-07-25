declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    IS_INTEGRATION_TEST?: string;
    REACT_APP_VX_DEV?: string;
    REACT_APP_VX_ENABLE_WRITE_IN_ADJUDICATION?: string;
    REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION?: string;
    REACT_APP_VX_ENABLE_REACT_QUERY_DEVTOOLS?: string;
    REACT_APP_VX_ENABLE_DEV_DOCK?: string;
    REACT_APP_VX_SKIP_PIN_ENTRY?: string;
    REACT_APP_VX_USE_MOCK_CARDS?: string;
    REACT_APP_VX_USE_MOCK_USB_DRIVE?: string;
    REACT_APP_VX_USE_MOCK_PRINTER?: string;
    REACT_APP_VX_USE_MOCK_PDI_SCANNER?: string;
    REACT_APP_VX_SKIP_CVR_BALLOT_HASH_CHECK?: string;
    REACT_APP_VX_SKIP_ELECTION_PACKAGE_AUTHENTICATION?: string;
    REACT_APP_VX_SKIP_CAST_VOTE_RECORDS_AUTHENTICATION?: string;
    REACT_APP_VX_USE_MOCK_PAPER_HANDLER?: string;
    REACT_APP_VX_MARK_SCAN_USE_BMD_150?: string;
    REACT_APP_VX_USE_BROTHER_PRINTER?: string;
    REACT_APP_VX_USE_CUSTOM_SCANNER?: string;
    REACT_APP_VX_ONLY_ENABLE_SCREEN_READER_FOR_HEADPHONES?: string;
    REACT_APP_VX_HIDE_CURSOR?: string;
    REACT_APP_VX_ENABLE_HARDWARE_TEST_APP?: string;
    REACT_APP_VX_ENABLE_HARDWARE_TEST_APP_INTERNAL_FUNCTIONS?: string;
    REACT_APP_VX_MARK_ENABLE_BALLOT_PRINT_MODE_TOGGLE?: string;
  }
}

declare namespace NodeJS {
  /** Environment variables read anywhere in the repo. */
  export interface ProcessEnv {
    ADMIN_ALLOWED_EXPORT_PATTERNS?: string;
    ADMIN_WORKSPACE?: string;
    AUTH0_CLIENT_DOMAIN?: string;
    AUTH0_CLIENT_ID?: string;
    AUTH0_ISSUER_BASE_URL?: string;
    AUTH0_SECRET?: string;
    AUTH_ENABLED?: string;
    AWS_S3_BUCKET_NAME?: string;
    AWS_S3_REGION?: string;
    BASE_URL?: string;
    CI?: string;
    CIRCLECI_API_TOKEN?: string;
    CIRCLECI_BASE_URL?: string;
    CIRCLECI_BRANCH?: string;
    CIRCLECI_PROJECT_SLUG?: string;
    CIRCLECI_QA_ORG_IDS?: string;
    CIRCLECI_WEBHOOK_SECRET?: string;
    DATABASE_URL?: string;
    DEPLOY_ENV?: string;
    FRONTEND_PORT?: string;
    GOOGLE_CLOUD_PROJECT_ID?: string;
    HEROKU_APP_NAME?: string;
    IS_INTEGRATION_TEST?: string;
    MARK_SCAN_WORKSPACE?: string;
    MARK_WORKSPACE?: string;
    NODE_ENV: 'development' | 'production' | 'test';
    ORG_ID_SLI?: string;
    ORG_ID_VOTINGWORKS?: string;
    PEER_PORT?: string;
    PIPENV_VENV_IN_PROJECT: string;
    PORT?: string;
    PRINT_WORKSPACE?: string;
    REACT_APP_IS_INTEGRATION_TEST?: string;
    REACT_APP_VX_APP_MODE?: string;
    REACT_APP_VX_CODE_VERSION?: string;
    REACT_APP_VX_DEV?: string;
    REACT_APP_VX_ENABLE_ADMIN_BACKUP_RESTORE?: string;
    REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION?: string;
    REACT_APP_VX_ENABLE_CENTRAL_SCAN_NETWORKING?: string;
    REACT_APP_VX_ENABLE_DEV_DOCK?: string;
    REACT_APP_VX_ENABLE_HARDWARE_TEST_APP?: string;
    REACT_APP_VX_ENABLE_HARDWARE_TEST_APP_INTERNAL_FUNCTIONS?: string;
    REACT_APP_VX_ENABLE_MULTI_STATION_ADMIN?: string;
    REACT_APP_VX_ENABLE_REACT_QUERY_DEVTOOLS?: string;
    REACT_APP_VX_ENABLE_WRITE_IN_ADJUDICATION?: string;
    REACT_APP_VX_HIDE_CURSOR?: string;
    REACT_APP_VX_MACHINE_ID?: string;
    REACT_APP_VX_MARK_ENABLE_BALLOT_PRINT_MODE_TOGGLE?: string;
    REACT_APP_VX_MARK_SCAN_USE_BMD_150?: string;
    REACT_APP_VX_ONLY_ENABLE_SCREEN_READER_FOR_HEADPHONES?: string;
    REACT_APP_VX_SKIP_CAST_VOTE_RECORDS_AUTHENTICATION?: string;
    REACT_APP_VX_SKIP_CVR_BALLOT_HASH_CHECK?: string;
    REACT_APP_VX_SKIP_ELECTION_PACKAGE_AUTHENTICATION?: string;
    REACT_APP_VX_SKIP_PIN_ENTRY?: string;
    REACT_APP_VX_USE_MOCK_ACCESSIBLE_CONTROLLER?: string;
    REACT_APP_VX_USE_MOCK_BARCODE_READER?: string;
    REACT_APP_VX_USE_MOCK_CARDS?: string;
    REACT_APP_VX_USE_MOCK_CENTRAL_SCANNER?: string;
    REACT_APP_VX_USE_MOCK_PAPER_HANDLER?: string;
    REACT_APP_VX_USE_MOCK_PDI_SCANNER?: string;
    REACT_APP_VX_USE_MOCK_PRINTER?: string;
    REACT_APP_VX_USE_MOCK_USB_DRIVE?: string;
    REACT_APP_VX_USE_MOCK_XKEYS?: string;
    SCAN_ALLOWED_EXPORT_PATTERNS?: string;
    SCAN_WORKSPACE?: string;
    SENTRY_DSN?: string;
    SLACK_WEBHOOK_URL?: string;
    USE_STRONGSWAN_TPM_KEY?: string;
    VX_CODE_VERSION?: string;
    VX_CONFIG_ROOT?: string;
    VX_MACHINE_ID?: string;
    VX_MACHINE_JURISDICTION?: string;
    VX_MACHINE_TYPE?:
      | 'admin'
      | 'central-scan'
      | 'mark'
      | 'mark-scan'
      | 'poll-book'
      | 'scan'
      | 'print';
    VX_SCREEN_ORIENTATION?: 'portrait' | 'landscape';
    WORKSPACE?: string;
  }
}

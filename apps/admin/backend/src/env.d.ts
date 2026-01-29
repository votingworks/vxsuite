declare namespace NodeJS {
  interface ProcessEnv {
    readonly ADMIN_WORKSPACE?: string;
    readonly ADMIN_ALLOWED_EXPORT_PATTERNS?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly FRONTEND_PORT?: string;
    readonly PORT?: string;
    readonly VX_CODE_VERSION?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_MACHINE_JURISDICTION?: string;
  }
}

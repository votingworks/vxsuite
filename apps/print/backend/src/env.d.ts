declare namespace NodeJS {
  /** process.env typings */
  export interface ProcessEnv {
    readonly FRONTEND_PORT?: string;
    readonly PRINT_WORKSPACE?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_CODE_VERSION?: string;
  }
}

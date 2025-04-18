declare namespace NodeJS {
  /** process.env typings */
  export interface ProcessEnv {
    readonly CI?: string;
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly LOCAL_PORT?: string;
    readonly PEER_PORT?: string;
    readonly WORKSPACE?: string;
    readonly VX_MACHINE_ID?: string;
    readonly VX_CODE_VERSION?: string;
  }
}

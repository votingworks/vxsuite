declare namespace NodeJS {
  /** process.env typings */
  export interface ProcessEnv {
    readonly PORT?: string;
    readonly BALLOT_ON_DEMAND_WORKSPACE?: string;
  }
}

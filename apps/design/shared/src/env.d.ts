declare namespace NodeJS {
  /** process.env typings */
  export interface ProcessEnv {
    readonly CI?: string;
  }
}

// Both Node and browser support console.log
declare module console {
  export function log(message?: any, ...optionalParams: any[]): void;
}

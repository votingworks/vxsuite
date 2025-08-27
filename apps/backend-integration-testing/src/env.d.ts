/* eslint-disable vx/gts-jsdoc */
declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    VX_MACHINE_TYPE?: string;
  }
}

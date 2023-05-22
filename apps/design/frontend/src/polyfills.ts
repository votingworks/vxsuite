import { Buffer } from 'buffer';

globalThis.global = globalThis;
globalThis.Buffer = Buffer;
globalThis.__dirname = '';
globalThis.process = {
  nextTick: (
    callback: (a1: any, a2: any, a3: any, a4: any, a5: any) => void,
    arg1: any,
    arg2: any,
    arg3: any,
    arg4: any,
    arg5: any
  ) => setTimeout(() => callback(arg1, arg2, arg3, arg4, arg5), 0),
};

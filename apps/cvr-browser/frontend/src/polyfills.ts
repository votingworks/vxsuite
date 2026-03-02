import { Buffer } from 'node:buffer';
import 'setimmediate';

globalThis.global = globalThis;
globalThis.Buffer = Buffer;
globalThis.process ??= {} as unknown as typeof process;

process.nextTick = setImmediate;

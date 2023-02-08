/**
 * Provides polyfills needed for this application and its dependencies.
 */

/* istanbul ignore file */
import { Buffer } from 'buffer';
import 'setimmediate';

globalThis.global = globalThis;
globalThis.Buffer = Buffer;
globalThis.process ??= {} as unknown as typeof process;

process.nextTick = setImmediate;

/* istanbul ignore file */
import { Buffer } from 'buffer';
import process from 'process';

globalThis.Buffer = Buffer;
globalThis.process = process;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - provide "global" for packages that assume NodeJS
globalThis.global = globalThis;

/**
 * Provides polyfills needed for this application and its dependencies.
 */

/* istanbul ignore file - @preserve */
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import { Buffer } from 'node:buffer';
import 'setimmediate';

globalThis.global = globalThis;
globalThis.Buffer = Buffer;

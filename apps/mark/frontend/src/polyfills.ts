/**
 * Provides polyfills needed for this application and its dependencies.
 */

/* istanbul ignore file */
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import { Buffer } from 'buffer';
import 'setimmediate';

globalThis.global = globalThis;
globalThis.Buffer = Buffer;

/**
 * Provides polyfills needed for this application and its dependencies.
 */

import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import { Buffer } from 'node:buffer';
import 'setimmediate';

globalThis.global = globalThis;
globalThis.Buffer = Buffer;

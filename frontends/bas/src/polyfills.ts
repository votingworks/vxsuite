/**
 * Provides polyfills needed for this application and its dependencies.
 */

import { Buffer } from 'buffer';

globalThis.global = globalThis;
globalThis.Buffer = Buffer;

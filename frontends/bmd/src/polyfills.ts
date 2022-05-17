/* istanbul ignore file */

import 'setimmediate';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - provide "global" for packages that assume NodeJS
globalThis.global = globalThis;

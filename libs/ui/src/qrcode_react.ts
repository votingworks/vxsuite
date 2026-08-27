// Loader interop only: the branch below is unreachable in any single
// environment, so this file is not meaningfully coverable.
/* istanbul ignore file */
// The namespace juggling below is deliberate interop, not prop drilling.
/* eslint-disable vx/gts-direct-module-export-access-only */
import * as qrcodeReactNamespace from 'qrcode.react';

/**
 * `QRCodeSVG` from qrcode.react, reached in whichever way the current loader
 * exposes it.
 *
 * qrcode.react is CommonJS and node's named-export detection cannot see its
 * exports, so `import { QRCodeSVG }` fails to *load* under node ESM (`tsc` is
 * happy — it reads the type declarations); the namespace's `default`, i.e.
 * `module.exports`, carries them instead. Vite and vitest do the opposite: they
 * surface the named exports on the namespace and unwrap `default` to the
 * package's own default export. Take whichever one has the component.
 */
const qrcodeReact =
  'QRCodeSVG' in qrcodeReactNamespace
    ? qrcodeReactNamespace
    : (
        qrcodeReactNamespace as unknown as {
          default: typeof qrcodeReactNamespace;
        }
      ).default;

export const QrCodeSvg = qrcodeReact.QRCodeSVG;

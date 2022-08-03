import { unsafeParse } from '@votingworks/types';
import { asBoolean } from '@votingworks/utils';
import { ConverterClientType, ConverterClientTypeSchema } from './types';

function isVxDev(): boolean {
  return asBoolean(process.env.REACT_APP_VX_DEV);
}

/**
 * Determines whether write-in adjudication is enabled.
 *
 * To enable write-in adjudication, add this line to `frontends/election-manager/.env.local`:
 *
 *     REACT_APP_VX_ENABLE_WRITE_IN_ADJUDICATION=true
 *
 * To disable it, remove the line or comment it out. Restarting the server is required.
 *
 * @see https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
export function isWriteInAdjudicationEnabled(): boolean {
  return (
    // Bundlers can tell this evaluates to `false` when building for production,
    // and can inline the function call. Thus, any uses of this function may
    // also enable further tree shaking when used in a way that the bundler can
    // understand, e.g. `if (isWriteInAdjudicationEnabled())` or
    // `isWriteInAdjudicationEnabled() && ...`.
    (process.env.NODE_ENV === 'development' || isVxDev()) &&
    asBoolean(process.env.REACT_APP_VX_ENABLE_WRITE_IN_ADJUDICATION)
  );
}

/**
 * Determines which converter client to use, if any.
 */
export function getConverterClientType(): ConverterClientType | undefined {
  const rawConverterClientType = process.env.REACT_APP_VX_CONVERTER;

  if (!rawConverterClientType) {
    return;
  }

  return unsafeParse(ConverterClientTypeSchema, rawConverterClientType);
}

/**
 * Determines whether generated smartcard PINs are all zeros (000000) instead of random. This can
 * be useful for local development and demos.
 *
 * To enable, add this line to frontends/election-manager/.env.local:
 *
 *     REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION=true
 *
 * @see https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
export function isAllZeroSmartcardPinGenerationEnabled(): boolean {
  return (
    (process.env.NODE_ENV === 'development' || isVxDev()) &&
    asBoolean(process.env.REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION)
  );
}

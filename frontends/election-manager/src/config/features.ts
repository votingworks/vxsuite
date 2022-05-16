import { unsafeParse } from '@votingworks/types';
import { asBoolean } from '@votingworks/utils';
import { ConverterClientType, ConverterClientTypeSchema } from './types';

/**
 * Determines whether authentication is enabled.
 *
 * To disable authentication, add this line to `frontends/election-manager/.env.local`:
 *
 *     REACT_APP_VX_BYPASS_AUTHENTICATION=true
 *
 * To enable it, remove the line or comment it out. Restarting the server is required.
 *
 * @see https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
export function isAuthenticationEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'development' ||
    !asBoolean(process.env.REACT_APP_VX_BYPASS_AUTHENTICATION)
  );
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
    process.env.NODE_ENV === 'development' &&
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

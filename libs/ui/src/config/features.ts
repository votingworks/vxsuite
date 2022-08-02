import { asBoolean } from '@votingworks/utils';

export function isVxDev(): boolean {
  return asBoolean(process.env.REACT_APP_VX_DEV);
}

/**
 * Determines whether to actually check for presence of card reader
 *
 * To disable,
 *
 *     REACT_APP_VX_DISABLE_CARD_READER_CHECK=true
 *
 * @see https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
export function isCardReaderCheckDisabled(): boolean {
  return (
    (process.env.NODE_ENV === 'development' || isVxDev()) &&
    asBoolean(process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK)
  );
}

/**
 * Determines whether generated smartcard PINs are all zeros (000000) instead of random. This can
 * be useful for local development and demos.
 *
 * To enable, add this line to the relevant frontend app's .env.local, e.g.
 * frontends/election-manager/.env.local:
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

/**
 * Determines whether VVSG2 auth flows are enabled.
 *
 * Now enabled by default.
 *
 * To disable VVSG2 auth flows, add this line to the relevant frontend app's .env.local, e.g.
 * frontends/election-manager/.env.local:
 *
 *     REACT_APP_VX_ENABLE_VVSG2_AUTH_FLOWS=false
 *
 * @see https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
export function areVvsg2AuthFlowsEnabled(): boolean {
  return asBoolean(process.env.REACT_APP_VX_ENABLE_VVSG2_AUTH_FLOWS);
}

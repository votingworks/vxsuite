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
 * Determines whether VVSG2 auth flows are enabled.
 *
 * To enable VVSG2 auth flows, add this line to the relevant frontend app's `.env.local`, e.g.
 * `frontends/election-manager/.env.local`:
 *
 *     REACT_APP_VX_ENABLE_VVSG2_AUTH_FLOWS=true
 *
 * To disable them, remove the line or comment it out. Restarting the server is required.
 *
 * @see https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
export function areVvsg2AuthFlowsEnabled(): boolean {
  return (
    (['development', 'test'].includes(process.env.NODE_ENV) || isVxDev()) &&
    asBoolean(process.env.REACT_APP_VX_ENABLE_VVSG2_AUTH_FLOWS)
  );
}

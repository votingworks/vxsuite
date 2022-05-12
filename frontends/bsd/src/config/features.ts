import { asBoolean } from '@votingworks/utils';

/**
 * Determines whether authentication is enabled.
 *
 * To disable authentication, add this line to `frontends/bsd/.env.local`:
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

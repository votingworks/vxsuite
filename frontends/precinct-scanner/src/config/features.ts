import { asBoolean } from '@votingworks/utils';

/**
 * Determines whether LiveCheck is enabled
 *
 * LiveCheck is a prototype feature.
 *
 * To enable it, add this line to `frontends/precinct-scanner/.env.local`:
 *
 *     REACT_APP_VX_ENABLE_LIVECHECK=true
 *
 * @see https://create-react-app.dev/docs/adding-custom-environment-variables/
 */
export function isLiveCheckEnabled(): boolean {
  return (
    (process.env.NODE_ENV === 'development' ||
      asBoolean(process.env.REACT_APP_VX_DEV)) &&
    asBoolean(process.env.REACT_APP_VX_ENABLE_LIVECHECK)
  );
}

import { asBoolean } from '@votingworks/utils';

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
    (process.env.NODE_ENV === 'development' ||
      asBoolean(process.env.REACT_APP_VX_DEV)) &&
    asBoolean(process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK)
  );
}

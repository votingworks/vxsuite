import { InsertedSmartCardAuth } from '@votingworks/types';
import { InvalidCardScreen as SharedInvalidCardScreen } from '@votingworks/ui';

import { ScreenMainCenterChild } from '../components/layout';

export function InvalidCardScreen({
  authStatus,
}: {
  authStatus: InsertedSmartCardAuth.LoggedOut;
}): JSX.Element {
  return (
    <ScreenMainCenterChild infoBarMode="pollworker" voterFacing={false}>
      <SharedInvalidCardScreen
        reasonAndContext={authStatus}
        recommendedAction="Remove the card to continue."
      />
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return (
    <InvalidCardScreen
      authStatus={{
        status: 'logged_out',
        reason: 'unprogrammed_or_invalid_card',
      }}
    />
  );
}

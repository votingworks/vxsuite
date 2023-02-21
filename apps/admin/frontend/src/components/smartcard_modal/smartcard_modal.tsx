import React, { useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { InvalidCardScreen, Modal } from '@votingworks/ui';
import { isSystemAdministratorAuth } from '@votingworks/utils';

import { AppContext } from '../../contexts/app_context';
import { routerPaths } from '../../router_paths';
import { CardDetailsView } from './card_details_view';
import { ProgramElectionCardView } from './program_election_card_view';
import { ProgramSystemAdministratorCardView } from './program_system_administrator_card_view';
import {
  InProgressStatusMessage,
  isSmartcardActionInProgress,
  SmartcardActionStatus,
} from './status_message';

export function SmartcardModal(): JSX.Element | null {
  const { auth } = useContext(AppContext);
  assert(isSystemAdministratorAuth(auth));
  const cardStatus = auth.programmableCard.status;
  const location = useLocation();
  const [actionStatus, setActionStatus] = useState<SmartcardActionStatus>();

  useEffect(() => {
    // Clear the current status message when the card is removed
    if (cardStatus === 'no_card') {
      setActionStatus(undefined);
    }
  }, [cardStatus]);

  switch (cardStatus) {
    case 'no_card': {
      return null;
    }
    case 'error': {
      return (
        <Modal fullscreen content={<InvalidCardScreen reason="card_error" />} />
      );
    }
    case 'ready': {
      const onSystemAdministratorSmartcardsScreen =
        location.pathname ===
        routerPaths.smartcardsByType({
          smartcardType: 'system-administrator',
        });
      let contents: JSX.Element;
      if (auth.programmableCard.programmedUser) {
        contents = (
          <CardDetailsView
            actionStatus={actionStatus}
            programmedUser={auth.programmableCard.programmedUser}
            setActionStatus={setActionStatus}
          />
        );
      } else if (onSystemAdministratorSmartcardsScreen) {
        contents = (
          <ProgramSystemAdministratorCardView
            actionStatus={actionStatus}
            setActionStatus={setActionStatus}
          />
        );
      } else {
        contents = (
          <ProgramElectionCardView
            actionStatus={actionStatus}
            setActionStatus={setActionStatus}
          />
        );
      }
      return (
        <React.Fragment>
          <Modal centerContent content={contents} fullscreen />
          {isSmartcardActionInProgress(actionStatus) && (
            <InProgressStatusMessage actionStatus={actionStatus} />
          )}
        </React.Fragment>
      );
    }

    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(cardStatus);
    }
  }
}

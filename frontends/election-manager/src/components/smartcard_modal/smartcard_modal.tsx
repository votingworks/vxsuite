import React, { useContext, useEffect, useState } from 'react';
import { assert, throwIllegalValue } from '@votingworks/utils';
import {
  InvalidCardScreen,
  isSystemAdministratorAuth,
  Modal,
} from '@votingworks/ui';
import { useLocation } from 'react-router-dom';

import { AppContext } from '../../contexts/app_context';
import { CardDetailsView } from './card_details_view';
import {
  InProgressStatusMessage,
  isSmartcardActionInProgress,
  SmartcardActionStatus,
} from './status_message';
import { ProgramElectionCardView } from './program_election_card_view';
import { ProgramSystemAdministratorCardView } from './program_system_administrator_card_view';
import { routerPaths } from '../../router_paths';

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
            card={auth.programmableCard}
            setActionStatus={setActionStatus}
          />
        );
      } else if (onSystemAdministratorSmartcardsScreen) {
        contents = (
          <ProgramSystemAdministratorCardView
            actionStatus={actionStatus}
            card={auth.programmableCard}
            setActionStatus={setActionStatus}
          />
        );
      } else {
        contents = (
          <ProgramElectionCardView
            actionStatus={actionStatus}
            card={auth.programmableCard}
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

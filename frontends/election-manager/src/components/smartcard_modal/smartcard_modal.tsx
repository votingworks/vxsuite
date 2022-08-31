import React, { useContext, useEffect, useState } from 'react';
import { assert } from '@votingworks/utils';
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
  const location = useLocation();
  const [actionStatus, setActionStatus] = useState<SmartcardActionStatus>();

  useEffect(() => {
    // Clear the current status message when the card is removed
    if (auth.card === 'no_card') {
      setActionStatus(undefined);
    }
  }, [auth.card]);

  // Auto-open the modal when a card is inserted, and auto-close the modal when a card is removed
  if (auth.card === 'no_card') {
    return null;
  }

  if (auth.card === 'error') {
    return (
      <Modal fullscreen content={<InvalidCardScreen reason="card_error" />} />
    );
  }

  const onSystemAdministratorSmartcardsScreen =
    location.pathname ===
    routerPaths.smartcardsByType({ smartcardType: 'system-administrator' });

  let contents: JSX.Element;
  if (auth.card.programmedUser) {
    contents = (
      <CardDetailsView
        actionStatus={actionStatus}
        card={auth.card}
        setActionStatus={setActionStatus}
      />
    );
  } else if (onSystemAdministratorSmartcardsScreen) {
    contents = (
      <ProgramSystemAdministratorCardView
        actionStatus={actionStatus}
        card={auth.card}
        setActionStatus={setActionStatus}
      />
    );
  } else {
    contents = (
      <ProgramElectionCardView
        actionStatus={actionStatus}
        card={auth.card}
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

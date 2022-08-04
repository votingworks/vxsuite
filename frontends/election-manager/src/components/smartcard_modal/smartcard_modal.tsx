import React, { useContext, useEffect, useState } from 'react';
import { assert } from '@votingworks/utils';
import { isSuperadminAuth, Modal } from '@votingworks/ui';
import { useLocation } from 'react-router-dom';

import { AppContext } from '../../contexts/app_context';
import { CardDetailsView } from './card_details_view';
import {
  InProgressStatusMessage,
  isSmartcardActionInProgress,
  SmartcardActionStatus,
} from './status_message';
import { ProgramElectionCardView } from './program_election_card_view';
import { ProgramSuperAdminCardView } from './program_super_admin_card_view';
import { routerPaths } from '../../router_paths';

export function SmartcardModal(): JSX.Element | null {
  const { auth } = useContext(AppContext);
  assert(isSuperadminAuth(auth));
  const location = useLocation();
  const [actionStatus, setActionStatus] = useState<SmartcardActionStatus>();

  useEffect(() => {
    // Clear the current status message when the card is removed
    if (!auth.card) {
      setActionStatus(undefined);
    }
  }, [auth.card]);

  // Auto-open the modal when a card is inserted, and auto-close the modal when a card is removed
  if (!auth.card) {
    return null;
  }

  const onSuperAdminSmartcardsScreen =
    location.pathname ===
    routerPaths.smartcardsByType({ smartcardType: 'super-admin' });

  let contents: JSX.Element;
  if (auth.card.programmedUser) {
    contents = (
      <CardDetailsView
        actionStatus={actionStatus}
        card={auth.card}
        setActionStatus={setActionStatus}
      />
    );
  } else if (onSuperAdminSmartcardsScreen) {
    contents = (
      <ProgramSuperAdminCardView
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

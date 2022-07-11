import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/utils';
import { isSuperadminAuth, Modal, Prose } from '@votingworks/ui';
import { useLocation } from 'react-router-dom';

import { AppContext } from '../../contexts/app_context';
import { routerPaths } from '../../router_paths';

const ModalContents = styled.div`
  padding: 1rem;
`;

type SmartcardModalView =
  | 'CardDetails'
  | 'ProgramElectionCard'
  | 'ProgramSuperAdminCard';

export function SmartcardModal(): JSX.Element | null {
  const { auth } = useContext(AppContext);
  assert(isSuperadminAuth(auth));

  const location = useLocation();
  const onSuperAdminSmartcardsScreen =
    location.pathname ===
    routerPaths.smartcardsByType({ smartcardType: 'super-admin' });

  // Auto-open the modal when a card is inserted, and auto-close the modal when a card is removed
  if (!auth.card) {
    return null;
  }

  let currentView: SmartcardModalView;
  if (auth.card.programmedUser) {
    currentView = 'CardDetails';
  } else {
    currentView = onSuperAdminSmartcardsScreen
      ? 'ProgramSuperAdminCard'
      : 'ProgramElectionCard';
  }

  let contents: JSX.Element | null;
  switch (currentView) {
    case 'CardDetails':
      contents = <h2>Card Details</h2>;
      break;
    case 'ProgramElectionCard':
      contents = <h2>Program Election Card</h2>;
      break;
    case 'ProgramSuperAdminCard':
      contents = <h2>Program Super Admin Card</h2>;
      break;
    /* istanbul ignore next: Compile-time check for completeness */
    default:
      contents = null;
  }
  return (
    <Modal
      content={
        <ModalContents>
          <Prose maxWidth={false} textCenter>
            {contents}
          </Prose>
        </ModalContents>
      }
      fullscreen
    />
  );
}

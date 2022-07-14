import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/utils';
import { isSuperadminAuth, Modal, Prose } from '@votingworks/ui';
import { useLocation } from 'react-router-dom';

import { AppContext } from '../../contexts/app_context';
import { CardDetailsView } from './card_details_view';
import { ProgramElectionCardView } from './program_election_card_view';
import { ProgramSuperAdminCardView } from './program_super_admin_card_view';
import { routerPaths } from '../../router_paths';

const ModalContents = styled.div`
  padding: 1rem;
`;

export function SmartcardModal(): JSX.Element | null {
  const { auth } = useContext(AppContext);
  const location = useLocation();

  assert(isSuperadminAuth(auth));

  // Auto-open the modal when a card is inserted, and auto-close the modal when a card is removed
  if (!auth.card) {
    return null;
  }

  const onSuperAdminSmartcardsScreen =
    location.pathname ===
    routerPaths.smartcardsByType({ smartcardType: 'super-admin' });

  let contents: JSX.Element;
  if (auth.card.programmedUser) {
    contents = <CardDetailsView card={auth.card} />;
  } else if (onSuperAdminSmartcardsScreen) {
    contents = <ProgramSuperAdminCardView card={auth.card} />;
  } else {
    contents = <ProgramElectionCardView card={auth.card} />;
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

import React from 'react';
import styled from 'styled-components';
import { assertDefined } from '@votingworks/basics';
import { PartyId } from '@votingworks/types';
import {
  Caption,
  H2,
  LinkButton,
  PageNavigationButtonId,
  RadioGroup,
  WithScrollButtons,
} from '@votingworks/ui';
import { VoterScreen } from '@votingworks/mark-flow-ui';
import { BallotContext } from '../contexts/ballot_context';

const Header = styled.div`
  padding: 0.5rem;
`;

const OptionRadioGroup = styled(RadioGroup<PartyId>)`
  button {
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  }
`;

export function PartySelectionScreen(): JSX.Element {
  const { electionDefinition, selectParty, selectedPartyId } =
    React.useContext(BallotContext);
  const { election } = assertDefined(electionDefinition);

  return (
    <VoterScreen
      actionButtons={
        <React.Fragment>
          <LinkButton
            icon="Previous"
            id={PageNavigationButtonId.PREVIOUS}
            to="/"
          >
            Back
          </LinkButton>
          <LinkButton
            rightIcon="Next"
            id={PageNavigationButtonId.NEXT}
            variant={selectedPartyId ? 'primary' : 'neutral'}
            to={selectedPartyId ? '/contests/0' : undefined}
            disabled={!selectedPartyId}
          >
            Next
          </LinkButton>
        </React.Fragment>
      }
    >
      <Header>
        <H2>Choose Your Party</H2>
        <Caption>
          You will be able to vote for your party&apos;s contests and any
          nonpartisan contests.
        </Caption>
      </Header>
      <WithScrollButtons>
        <OptionRadioGroup
          label="Party"
          hideLabel
          options={election.parties.map((party) => ({
            value: party.id,
            label: party.fullName,
          }))}
          value={selectedPartyId}
          onChange={(partyId) => selectParty(partyId)}
        />
      </WithScrollButtons>
    </VoterScreen>
  );
}

import React from 'react';
import styled from 'styled-components';
import { assertDefined } from '@votingworks/basics';
import { PartyId } from '@votingworks/types';
import {
  appStrings,
  Button,
  Caption,
  electionStrings,
  H2,
  LinkButton,
  Modal,
  P,
  PageNavigationButtonId,
  RadioGroup,
  WithScrollButtons,
} from '@votingworks/ui';
import { useIsReviewMode, VoterScreen } from '@votingworks/mark-flow-ui';
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
  const { electionDefinition, selectParty, selectedPartyId, votes } =
    React.useContext(BallotContext);
  const { election } = assertDefined(electionDefinition);
  const [partyIdToConfirm, setPartyIdToConfirm] = React.useState<PartyId>();
  // Snapshot the initial review mode state so that we can flip it off if the
  // voter changes their party
  const [isReviewMode, setIsReviewMode] = React.useState(useIsReviewMode());

  function handleSelect(partyId: PartyId) {
    if (
      partyId !== selectedPartyId &&
      Object.values(votes).some(
        (contestVotes) => contestVotes && contestVotes.length > 0
      )
    ) {
      setPartyIdToConfirm(partyId);
    } else {
      selectParty(partyId);
    }
  }

  return (
    <VoterScreen
      actionButtons={
        isReviewMode ? (
          <LinkButton
            icon="Previous"
            id={PageNavigationButtonId.NEXT}
            variant="primary"
            to="/review"
          >
            {appStrings.buttonReview()}
          </LinkButton>
        ) : (
          <React.Fragment>
            <LinkButton
              icon="Previous"
              id={PageNavigationButtonId.PREVIOUS}
              to="/"
            >
              {appStrings.buttonBack()}
            </LinkButton>
            <LinkButton
              rightIcon="Next"
              id={PageNavigationButtonId.NEXT}
              variant={selectedPartyId ? 'primary' : 'neutral'}
              to={selectedPartyId ? '/contests/0' : undefined}
              disabled={!selectedPartyId}
            >
              {appStrings.buttonNext()}
            </LinkButton>
          </React.Fragment>
        )
      }
    >
      <Header>
        <H2>{appStrings.titleBmdPartySelectionScreen()}</H2>
        <Caption>{appStrings.instructionsBmdPartySelection()}</Caption>
      </Header>
      <WithScrollButtons>
        <OptionRadioGroup
          label="Party"
          hideLabel
          options={election.parties.map((party) => ({
            value: party.id,
            label: electionStrings.partyFullName(party),
          }))}
          value={selectedPartyId}
          onChange={handleSelect}
        />
      </WithScrollButtons>
      {partyIdToConfirm && (
        <Modal
          title={appStrings.titleBmdConfirmPartyChange()}
          content={<P>{appStrings.warningBmdPartyChangeClearsVotes()}</P>}
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                onPress={() => {
                  selectParty(partyIdToConfirm);
                  setPartyIdToConfirm(undefined);
                  setIsReviewMode(false);
                }}
              >
                {appStrings.buttonChangeParty()}
              </Button>
              <Button onPress={() => setPartyIdToConfirm(undefined)}>
                {appStrings.buttonCancel()}
              </Button>
            </React.Fragment>
          }
          onOverlayClick={
            /* istanbul ignore next - @preserve */
            () => setPartyIdToConfirm(undefined)
          }
        />
      )}
    </VoterScreen>
  );
}

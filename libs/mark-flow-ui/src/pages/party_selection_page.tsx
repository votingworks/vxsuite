// @coverage-exclude-file: tested via Mark/Mark-Scan
import React from 'react';
import styled from 'styled-components';
import { Election, PartyId, VotesDict } from '@votingworks/types';
import {
  appStrings,
  AssistiveTechInstructions,
  AudioOnly,
  Button,
  Caption,
  electionStrings,
  H2,
  LinkButton,
  Modal,
  P,
  PageNavigationButtonId,
  RadioGroup,
  ReadOnLoad,
  WithScrollButtons,
} from '@votingworks/ui';
import { VoterScreen } from '../components/voter_screen';
import { useIsReviewMode } from './contest_page';

const Header = styled.div`
  padding: 0.5rem;
`;

const OptionRadioGroup = styled(RadioGroup<PartyId>)`
  button {
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  }
`;

export interface PartySelectionPageProps {
  election: Election;
  selectedPartyId?: PartyId;
  selectParty: (partyId: PartyId) => void;
  votes: VotesDict;
  startPageUrl: string;
  contestsPageUrl: string;
  reviewPageUrl: string;
}

export function PartySelectionPage({
  election,
  selectedPartyId,
  selectParty,
  votes,
  startPageUrl,
  contestsPageUrl,
  reviewPageUrl,
}: PartySelectionPageProps): JSX.Element {
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
            to={reviewPageUrl}
          >
            {appStrings.buttonReview()}
          </LinkButton>
        ) : (
          <React.Fragment>
            <LinkButton
              icon="Previous"
              id={PageNavigationButtonId.PREVIOUS}
              to={startPageUrl}
            >
              {appStrings.buttonBack()}
            </LinkButton>
            <LinkButton
              rightIcon="Next"
              id={PageNavigationButtonId.NEXT}
              variant={selectedPartyId ? 'primary' : 'neutral'}
              to={selectedPartyId ? contestsPageUrl : undefined}
              disabled={!selectedPartyId}
            >
              {appStrings.buttonNext()}
            </LinkButton>
          </React.Fragment>
        )
      }
    >
      <Header>
        <ReadOnLoad>
          <H2>{appStrings.titleBmdPartySelectionScreen()}</H2>
          <Caption>
            {appStrings.instructionsBmdPartySelection()}
            <AudioOnly>
              <AssistiveTechInstructions
                controllerString={appStrings.instructionsBmdPartySelectionNavigation()}
                patDeviceString={appStrings.instructionsBmdPartySelectionNavigationPatDevice()}
              />
            </AudioOnly>
          </Caption>
        </ReadOnLoad>
      </Header>
      <WithScrollButtons>
        <OptionRadioGroup
          label="Party"
          hideLabel
          options={election.parties.map((party) => {
            const isSelected = party.id === selectedPartyId;
            return {
              value: party.id,
              label: (
                <React.Fragment>
                  {isSelected && (
                    <AudioOnly>{appStrings.labelSelected()}</AudioOnly>
                  )}
                  {electionStrings.partyFullName(party)}
                  {isSelected && !isReviewMode && (
                    <AudioOnly>
                      {appStrings.noteBmdPartySelectionCompleted()}
                    </AudioOnly>
                  )}
                </React.Fragment>
              ),
            };
          })}
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
                id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
                variant="primary"
                onPress={() => {
                  selectParty(partyIdToConfirm);
                  setPartyIdToConfirm(undefined);
                  setIsReviewMode(false);
                }}
              >
                {appStrings.buttonChangeParty()}
                <AudioOnly>
                  <AssistiveTechInstructions
                    controllerString={appStrings.instructionsBmdSelectToConfirm()}
                    patDeviceString={appStrings.instructionsBmdSelectToConfirmPatDevice()}
                  />
                </AudioOnly>
              </Button>
              <Button
                id={PageNavigationButtonId.PREVIOUS}
                onPress={() => setPartyIdToConfirm(undefined)}
              >
                {appStrings.buttonCancel()}
              </Button>
            </React.Fragment>
          }
          onOverlayClick={() => setPartyIdToConfirm(undefined)}
        />
      )}
    </VoterScreen>
  );
}

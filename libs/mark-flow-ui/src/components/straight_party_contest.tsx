import React, { ReactNode, useEffect, useState } from 'react';
import {
  Election,
  PartyId,
  StraightPartyContest as StraightPartyContestInterface,
  StraightPartyVote,
} from '@votingworks/types';
import {
  Button,
  ContestChoiceButton,
  Main,
  Modal,
  P,
  Caption,
  WithScrollButtons,
  AudioOnly,
  appStrings,
  electionStrings,
  AssistiveTechInstructions,
  PageNavigationButtonId,
  useIsPatDeviceConnected,
} from '@votingworks/ui';

import { Optional } from '@votingworks/basics';

import { ContestFooter, ChoicesGrid } from './contest_screen_layout';
import { BreadcrumbMetadata, ContestHeader } from './contest_header';
import { UpdateVoteFunction } from '../config/types';

interface Props {
  breadcrumbs?: BreadcrumbMetadata;
  election: Election;
  contest: StraightPartyContestInterface;
  vote?: StraightPartyVote;
  updateVote: UpdateVoteFunction;
}

export function StraightPartyContest({
  breadcrumbs,
  election,
  contest,
  vote,
  updateVote,
}: Props): JSX.Element {
  const [overvoteSelection, setOvervoteSelection] =
    useState<Optional<PartyId>>();
  const [deselectedVote, setDeselectedVote] = useState('');

  const isPatDeviceConnected = useIsPatDeviceConnected();

  const selectedPartyId = vote?.length === 1 ? vote[0] : undefined;

  useEffect(() => {
    if (deselectedVote !== '') {
      const timer = setTimeout(() => setDeselectedVote(''), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedVote]);

  function handleUpdateSelection(partyId: PartyId) {
    if (selectedPartyId === partyId) {
      updateVote(contest.id, undefined);
      setDeselectedVote(partyId);
    } else {
      updateVote(contest.id, [partyId]);
    }
  }

  function handleChangeVoteAlert(partyId: PartyId) {
    setOvervoteSelection(partyId);
  }

  function closeOvervoteAlert() {
    setOvervoteSelection(undefined);
  }

  return (
    <React.Fragment>
      <Main flexColumn>
        <WithScrollButtons focusable={isPatDeviceConnected}>
          <ContestHeader
            breadcrumbs={breadcrumbs}
            contest={contest}
            className="no-horizontal-padding"
          >
            <Caption>
              <AudioOnly>
                <AssistiveTechInstructions
                  controllerString={appStrings.instructionsBmdContestNavigation()}
                  patDeviceString={appStrings.instructionsBmdContestNavigationPatDevice()}
                />
              </AudioOnly>
            </Caption>
          </ContestHeader>
        </WithScrollButtons>
        <ContestFooter>
          <ChoicesGrid data-testid="contest-choices">
            {election.parties.map((party) => {
              const isChecked = selectedPartyId === party.id;
              const isDisabled = !isChecked && !!selectedPartyId;
              function handleDisabledClick() {
                handleChangeVoteAlert(party.id);
              }
              let prefixAudioText: ReactNode = null;
              let suffixAudioText: ReactNode = null;
              if (isChecked) {
                prefixAudioText = appStrings.labelSelectedOption();
                suffixAudioText = appStrings.noteBmdContestCompleted();
              } else if (deselectedVote === party.id) {
                prefixAudioText = appStrings.labelDeselectedOption();
              }
              return (
                <ContestChoiceButton
                  key={party.id}
                  choice={party.id}
                  isSelected={isChecked}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                  label={
                    <React.Fragment>
                      <AudioOnly>
                        {prefixAudioText}
                        {electionStrings.contestTitle(contest)} |{' '}
                      </AudioOnly>
                      {electionStrings.partyFullName(party)}
                      <AudioOnly>{suffixAudioText}</AudioOnly>
                    </React.Fragment>
                  }
                />
              );
            })}
          </ChoicesGrid>
        </ContestFooter>
      </Main>
      {overvoteSelection && (
        <Modal
          centerContent
          content={
            <P>
              {appStrings.warningOvervoteYesNoContest()}
              <AudioOnly>
                <AssistiveTechInstructions
                  controllerString={appStrings.instructionsBmdNextToContinue()}
                  patDeviceString={appStrings.instructionsBmdMoveToSelectToContinuePatDevice()}
                />
              </AudioOnly>
            </P>
          }
          actions={
            <Button
              variant="primary"
              autoFocus
              onPress={closeOvervoteAlert}
              id={PageNavigationButtonId.NEXT}
            >
              {appStrings.buttonContinue()}
              <AudioOnly>
                <AssistiveTechInstructions
                  controllerString={appStrings.instructionsBmdSelectToContinue()}
                  patDeviceString={appStrings.instructionsBmdSelectToContinuePatDevice()}
                />
              </AudioOnly>
            </Button>
          }
        />
      )}
    </React.Fragment>
  );
}

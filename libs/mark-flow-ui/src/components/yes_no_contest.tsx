import React, { ReactNode, useEffect, useState } from 'react';
import {
  YesNoVote,
  YesNoContest as YesNoContestInterface,
  Election,
  YesNoContestOptionId,
  getContestDistrict,
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
  electionStrings,
  appStrings,
  AssistiveTechInstructions,
  PageNavigationButtonId,
  useIsPatDeviceConnected,
  RichText,
} from '@votingworks/ui';

import { getSingleYesNoVote } from '@votingworks/utils';
import { Optional } from '@votingworks/basics';

import { ContestFooter, ChoicesGrid } from './contest_screen_layout';
import { BreadcrumbMetadata, ContestHeader } from './contest_header';
import { UpdateVoteFunction } from '../config/types';

interface Props {
  breadcrumbs?: BreadcrumbMetadata;
  election: Election;
  contest: YesNoContestInterface;
  vote?: YesNoVote;
  updateVote: UpdateVoteFunction;
}

export function YesNoContest({
  breadcrumbs,
  election,
  contest,
  vote,
  updateVote,
}: Props): JSX.Element {
  const district = getContestDistrict(election, contest);

  const [overvoteSelection, setOvervoteSelection] =
    useState<Optional<YesNoContestOptionId>>();
  const [deselectedVote, setDeselectedVote] = useState('');

  const isPatDeviceConnected = useIsPatDeviceConnected();

  useEffect(() => {
    if (deselectedVote !== '') {
      const timer = setTimeout(() => setDeselectedVote(''), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedVote]);

  function handleUpdateSelection(newVote: YesNoContestOptionId) {
    if ((vote as string[] | undefined)?.includes(newVote)) {
      updateVote(contest.id, undefined);
      setDeselectedVote(newVote);
    } else {
      updateVote(contest.id, [newVote]);
    }
  }

  function handleChangeVoteAlert(newValue: YesNoContestOptionId) {
    setOvervoteSelection(newValue);
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
            district={district}
            className="no-horizontal-padding"
          >
            <Caption>
              <AudioOnly>
                {electionStrings.contestDescription(contest)}
                <AssistiveTechInstructions
                  controllerString={appStrings.instructionsBmdContestNavigation()}
                  patDeviceString={appStrings.instructionsBmdContestNavigationPatDevice()}
                />
              </AudioOnly>
            </Caption>
          </ContestHeader>
          <RichText>{electionStrings.contestDescription(contest)}</RichText>
        </WithScrollButtons>
        <ContestFooter>
          <ChoicesGrid data-testid="contest-choices">
            {[contest.yesOption, contest.noOption].map((option) => {
              const isChecked = getSingleYesNoVote(vote) === option.id;
              const isDisabled = !isChecked && !!vote;
              function handleDisabledClick() {
                handleChangeVoteAlert(option.id);
              }
              let prefixAudioText: ReactNode = null;
              if (isChecked) {
                prefixAudioText = appStrings.labelSelectedOption();
              } else if (deselectedVote === option.id) {
                prefixAudioText = appStrings.labelDeselectedOption();
              }
              return (
                <ContestChoiceButton
                  key={option.id}
                  choice={option.id}
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
                      {electionStrings.contestOptionLabel(option)}
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
              {appStrings.buttonOkay()}
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

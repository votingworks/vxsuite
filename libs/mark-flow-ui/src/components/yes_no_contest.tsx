import React, { ReactNode, useEffect, useRef, useState } from 'react';
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
  Pre,
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

  const closeModalRef = useRef<Button<never>>(null);
  return (
    <React.Fragment>
      <Main flexColumn>
        <ContestHeader
          breadcrumbs={breadcrumbs}
          contest={contest}
          district={district}
        >
          <Caption>
            <AudioOnly>
              {electionStrings.contestDescription(contest, Pre)}
              <AssistiveTechInstructions
                controllerString={appStrings.instructionsBmdContestNavigation()}
                patDeviceString={appStrings.instructionsBmdContestNavigationPatDevice()}
              />
            </AudioOnly>
          </Caption>
        </ContestHeader>
        <WithScrollButtons>
          <Caption>{electionStrings.contestDescription(contest, Pre)}</Caption>
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
          isOpen={!!overvoteSelection}
          onAfterOpen={() => {
            // Focus the 'Okay' button to dismiss the modal automatically
            /* istanbul ignore next */
            closeModalRef?.current?.focus();
          }}
          content={
            <P>
              {appStrings.warningOvervoteYesNoContest()}
              <AudioOnly>
                <AssistiveTechInstructions
                  controllerString={appStrings.instructionsBmdSelectToContinue()}
                  patDeviceString={appStrings.instructionsBmdSelectToContinuePatDevice()}
                />
              </AudioOnly>
            </P>
          }
          actions={
            <Button
              variant="primary"
              onPress={closeOvervoteAlert}
              ref={closeModalRef}
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

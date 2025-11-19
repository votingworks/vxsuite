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
  /** When true, allow selecting both YES and NO with a warning modal. */
  allowOvervotes?: boolean;
}

export function YesNoContest({
  breadcrumbs,
  election,
  contest,
  vote,
  updateVote,
  allowOvervotes,
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
    const current = vote || [];
    const isChecked = current.includes(newVote);
    if (isChecked) {
      const next = current.filter((v) => v !== newVote);
      updateVote(contest.id, next.length > 0 ? (next as YesNoVote) : undefined);
      setDeselectedVote(newVote);
      return;
    }

    // Not currently selected
    if (allowOvervotes && current.length === 1) {
      const next: YesNoVote = [current[0], newVote];
      updateVote(contest.id, next);
      setOvervoteSelection(newVote); // always show when creating (1 -> 2)
      return;
    }

    // Default behavior: replace with single selection
    updateVote(contest.id, [newVote]);
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
              const selected = vote ?? [];
              const isChecked = selected.includes(option.id);
              const oneOptionChecked = selected.length === 1;
              const isDisabled =
                !allowOvervotes && !isChecked && selected.length > 0;
              function handleDisabledClick() {
                handleChangeVoteAlert(option.id);
              }
              let prefixAudioText: ReactNode = null;
              let suffixAudioText: ReactNode = null;
              if (isChecked) {
                prefixAudioText = appStrings.labelSelectedOption();
                if (oneOptionChecked) {
                  suffixAudioText = appStrings.noteBmdContestCompleted();
                } else {
                  suffixAudioText = appStrings.warningBothOptionsSelected();
                }
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
              {allowOvervotes
                ? appStrings.infoAllowedOvervoteYesNoContest()
                : appStrings.warningOvervoteYesNoContest()}
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

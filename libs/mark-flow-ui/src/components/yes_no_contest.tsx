import React, { ReactNode, useEffect, useState } from 'react';
import {
  YesNoVote,
  YesNoContest as YesNoContestInterface,
  Election,
  YesNoContestOptionId,
  getContestDistrict,
  ElectionStringKey,
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
  UiStringsReactQueryApi,
} from '@votingworks/ui';

import { Optional } from '@votingworks/basics';

import getDeepValue from 'lodash.get';
import { ContestFooter, ChoicesGrid } from './contest_screen_layout';
import { BreadcrumbMetadata, ContestHeader } from './contest_header';
import { UpdateVoteFunction } from '../config/types';

interface Props {
  allowOvervotes?: boolean;
  breadcrumbs?: BreadcrumbMetadata;
  election: Election;
  contest: YesNoContestInterface;
  vote?: YesNoVote;
  updateVote: UpdateVoteFunction;
  uiStringsApi: UiStringsReactQueryApi;
}

export function YesNoContest({
  allowOvervotes,
  breadcrumbs,
  election,
  contest,
  vote,
  updateVote,
  uiStringsApi,
}: Props): React.ReactNode {
  const district = getContestDistrict(election, contest);

  const [overvoteSelection, setOvervoteSelection] =
    useState<Optional<YesNoContestOptionId>>();
  const [deselectedVote, setDeselectedVote] = useState('');

  const isPatDeviceConnected = useIsPatDeviceConnected();

  const audioIdsQuery = uiStringsApi.getAudioIds.useQuery('en');
  const hasContestAudioOverride = !!getDeepValue(
    audioIdsQuery.data,
    `${ElectionStringKey.LA_CONTEST_AUDIO}.${contest.id}`
  );

  useEffect(() => {
    if (deselectedVote !== '') {
      const timer = setTimeout(() => setDeselectedVote(''), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedVote]);

  function handleUpdateSelection(newVote: YesNoContestOptionId) {
    if ((vote as string[] | undefined)?.includes(newVote)) {
      const updatedVote = (vote ?? []).filter((v) => v !== newVote);
      updateVote(
        contest.id,
        updatedVote.length === 0 ? undefined : updatedVote
      );
      setDeselectedVote(newVote);
    } else {
      updateVote(contest.id, [...(vote ?? []), newVote]);
    }
  }

  function handleChangeVoteAlert(newValue: YesNoContestOptionId) {
    setOvervoteSelection(newValue);
  }

  function closeOvervoteAlert() {
    setOvervoteSelection(undefined);
  }

  if (audioIdsQuery.isLoading) return null;

  return (
    <React.Fragment>
      <Main flexColumn>
        <WithScrollButtons focusable={isPatDeviceConnected}>
          <ContestHeader
            breadcrumbs={breadcrumbs}
            contest={contest}
            district={district}
            className="no-horizontal-padding"
            uiStringsApi={uiStringsApi}
          >
            <Caption>
              <AudioOnly>
                {!hasContestAudioOverride &&
                  electionStrings.contestDescription(contest)}
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
              const isChecked = vote?.includes(option.id);
              const isDisabled = !isChecked && !!vote && !allowOvervotes;
              function handleDisabledClick() {
                handleChangeVoteAlert(option.id);
              }
              let prefixAudioText: ReactNode = null;
              let suffixAudioText: ReactNode = null;
              if (isChecked) {
                prefixAudioText = appStrings.labelSelectedOption();
                suffixAudioText = appStrings.noteBmdContestCompleted();
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

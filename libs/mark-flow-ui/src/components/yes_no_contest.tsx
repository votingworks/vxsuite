import React, { useEffect, useState } from 'react';
import {
  YesNoVote,
  YesNoContest as YesNoContestInterface,
  getContestDistrictName,
  Election,
  YesNoContestOptionId,
} from '@votingworks/types';
import {
  Button,
  ContestChoiceButton,
  Main,
  Modal,
  Prose,
  P,
  Caption,
  Pre,
  WithScrollButtons,
} from '@votingworks/ui';

import { getSingleYesNoVote } from '@votingworks/utils';
import { Optional } from '@votingworks/basics';
import { UpdateVoteFunction } from '../config/types';

import { ContestFooter, ChoicesGrid } from './contest_screen_layout';
import { BreadcrumbMetadata, ContestHeader } from './contest_header';

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
  const districtName = getContestDistrictName(election, contest);

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

  return (
    <React.Fragment>
      <Main flexColumn>
        <ContestHeader
          breadcrumbs={breadcrumbs}
          districtName={districtName}
          title={contest.title}
        >
          <Caption>
            Vote <strong>Yes</strong> or <strong>No</strong>.
            <span className="screen-reader-only">
              {contest.description}
              To navigate through the contest choices, use the down button. To
              move to the next contest, use the right button.
            </span>
          </Caption>
        </ContestHeader>
        <WithScrollButtons>
          <Caption>
            <Pre>{contest.description}</Pre>
          </Caption>
        </WithScrollButtons>
        <ContestFooter>
          <ChoicesGrid data-testid="contest-choices">
            {[contest.yesOption, contest.noOption].map((option) => {
              const isChecked = getSingleYesNoVote(vote) === option.id;
              const isDisabled = !isChecked && !!vote;
              function handleDisabledClick() {
                handleChangeVoteAlert(option.id);
              }
              let prefixAudioText = '';
              if (isChecked) {
                prefixAudioText = 'Selected,';
              } else if (deselectedVote === option.id) {
                prefixAudioText = 'Deselected,';
              }
              return (
                <ContestChoiceButton
                  key={option.id}
                  choice={option.id}
                  isSelected={isChecked}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                  ariaLabel={`${prefixAudioText} ${option.label} on ${contest.title}`}
                  label={option.label}
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
            <Prose>
              {overvoteSelection && (
                <P id="modalaudiofocus">
                  Do you want to change your vote to{' '}
                  <strong>
                    {overvoteSelection === contest.yesOption.id
                      ? contest.yesOption.label
                      : contest.noOption.label}
                  </strong>
                  ? To change your vote, first unselect your vote for{' '}
                  <strong>
                    {overvoteSelection === contest.yesOption.id
                      ? contest.noOption.label
                      : contest.yesOption.label}
                  </strong>
                  .
                </P>
              )}
            </Prose>
          }
          actions={
            <Button variant="primary" autoFocus onPress={closeOvervoteAlert}>
              Okay
            </Button>
          }
        />
      )}
    </React.Fragment>
  );
}

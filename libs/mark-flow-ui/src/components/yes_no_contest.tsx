import React, { useEffect, useState } from 'react';
import {
  YesNoVote,
  YesNoContest as YesNoContestInterface,
  YesOrNo,
  getContestDistrictName,
  Election,
} from '@votingworks/types';
import {
  Button,
  ContestChoiceButton,
  DisplayTextForYesOrNo,
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
    useState<Optional<YesOrNo>>();
  const [deselectedVote, setDeselectedVote] = useState('');

  useEffect(() => {
    if (deselectedVote !== '') {
      const timer = setTimeout(() => setDeselectedVote(''), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedVote]);

  function handleUpdateSelection(newVote: YesOrNo) {
    if ((vote as string[] | undefined)?.includes(newVote)) {
      updateVote(contest.id, undefined);
      setDeselectedVote(newVote);
    } else {
      updateVote(contest.id, [newVote] as YesNoVote);
    }
  }

  function handleChangeVoteAlert(newValue: YesOrNo) {
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
            {[
              { label: 'Yes', vote: 'yes' } as const,
              { label: 'No', vote: 'no' } as const,
            ].map((answer) => {
              const isChecked = getSingleYesNoVote(vote) === answer.vote;
              const isDisabled = !isChecked && !!vote;
              function handleDisabledClick() {
                handleChangeVoteAlert(answer.vote);
              }
              let prefixAudioText = '';
              if (isChecked) {
                prefixAudioText = 'Selected,';
              } else if (deselectedVote === answer.vote) {
                prefixAudioText = 'Deselected,';
              }
              return (
                <ContestChoiceButton
                  key={answer.vote}
                  choice={answer.vote}
                  isSelected={isChecked}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                  ariaLabel={`${prefixAudioText} ${answer.label} on ${contest.title}`}
                  label={answer.label}
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
                  <strong>{DisplayTextForYesOrNo[overvoteSelection]}</strong>?
                  To change your vote, first unselect your vote for{' '}
                  <strong>
                    {
                      {
                        no: DisplayTextForYesOrNo.yes,
                        yes: DisplayTextForYesOrNo.no,
                      }[overvoteSelection]
                    }
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

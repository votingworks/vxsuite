import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  ContestChoiceButton,
  Main,
  Prose,
  Caption,
  Pre,
  WithScrollButtons,
} from '@votingworks/ui';

import { YesNoVote, Election } from '@votingworks/types';

import { UpdateVoteFunction } from '../config/types';
import {
  getContestDistrictName,
  MsEitherNeitherContest as MsEitherNeitherContestInterface,
} from '../utils/ms_either_neither_contests';
import { ContentHeader } from './contest_screen_layout';
import { ContestTitle } from './contest_title';

const ChoicesGrid = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 0.5rem;
  grid-template-areas:
    'either-neither-label divider pick-one-label'
    'either-option divider first-option'
    'neither-option divider second-option';
  grid-template-columns: 1fr calc(0.5rem + 1px) 1fr;
  grid-template-rows: auto;
  padding: 0.5rem;
`;
const GridLabel = styled.div`
  display: flex;
  align-items: flex-end;
`;
const Divider = styled.div`
  display: flex;
  grid-area: divider;
  justify-content: center;
  &::before {
    background: ${(p) => p.theme.colors.foreground};
    width: ${(p) => p.theme.sizes.bordersRem.medium}rem;
    content: '';
  }
`;

interface Props {
  election: Election;
  contest: MsEitherNeitherContestInterface;
  eitherNeitherContestVote?: YesNoVote;
  pickOneContestVote?: YesNoVote;
  updateVote: UpdateVoteFunction;
}

export function MsEitherNeitherContest({
  election,
  contest,
  eitherNeitherContestVote,
  pickOneContestVote,
  updateVote,
}: Props): JSX.Element {
  const [deselectedOption, setDeselectedOption] = useState<
    'either' | 'neither' | 'first' | 'second'
  >();

  function handleUpdateEitherNeither(targetVote: string) {
    const currentVote = eitherNeitherContestVote?.[0];
    const newVote =
      currentVote === targetVote ? ([] as YesNoVote) : [targetVote];
    setDeselectedOption(
      currentVote === 'yes'
        ? 'either'
        : currentVote === 'no'
        ? 'neither'
        : undefined
    );
    updateVote(contest.eitherNeitherContestId, newVote as YesNoVote);
  }
  function handleUpdatePickOne(targetVote: string) {
    const currentVote = pickOneContestVote?.[0];
    const newVote =
      currentVote === targetVote ? ([] as YesNoVote) : [targetVote];
    setDeselectedOption(
      currentVote === 'yes'
        ? 'first'
        : currentVote === 'no'
        ? 'second'
        : undefined
    );
    updateVote(contest.pickOneContestId, newVote as YesNoVote);
  }

  const districtName = getContestDistrictName(election, contest);
  const eitherNeitherVote = eitherNeitherContestVote?.[0];
  const forEither = '“for either”';
  const againstBoth = '“against both”';
  const eitherLabel = eitherNeitherVote === 'yes' ? forEither : againstBoth;
  const pickOneVote = pickOneContestVote?.[0];

  const eitherSelected = eitherNeitherContestVote?.[0] === 'yes';
  const neitherSelected = eitherNeitherContestVote?.[0] === 'no';
  const firstSelected = pickOneContestVote?.[0] === 'yes';
  const secondSelected = pickOneContestVote?.[0] === 'no';

  useEffect(() => {
    if (deselectedOption) {
      const timer = setTimeout(() => setDeselectedOption(undefined), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedOption]);

  return (
    <Main flexColumn>
      <ContentHeader>
        <Prose>
          <ContestTitle districtName={districtName} title={contest.title} />
          <Caption>
            {eitherNeitherVote && pickOneVote ? (
              <span>
                You have selected {eitherLabel} and your preferred measure.
              </span>
            ) : eitherNeitherVote && !pickOneVote ? (
              <span>
                You have selected {eitherLabel}.{' '}
                {eitherNeitherVote === 'yes' ? (
                  <strong>Now select your preferred measure.</strong>
                ) : (
                  <strong>
                    You may additionally select your preferred measure.
                  </strong>
                )}
              </span>
            ) : !eitherNeitherVote && pickOneVote ? (
              <span>
                You have selected your preferred measure.{' '}
                <strong>
                  Now vote {forEither} or {againstBoth}.
                </strong>
              </span>
            ) : (
              <span>
                First vote {forEither} or {againstBoth}. Then select your
                preferred measure.
              </span>
            )}
            <span className="screen-reader-only">
              To navigate through the contest choices, use the down button. To
              move to the next contest, use the right button.
            </span>
          </Caption>
        </Prose>
      </ContentHeader>
      <WithScrollButtons>
        <Caption>
          <Pre>{contest.description}</Pre>
        </Caption>
      </WithScrollButtons>
      <ChoicesGrid data-testid="contest-choices">
        <GridLabel
          style={{
            gridArea: 'either-neither-label',
          }}
        >
          <Caption weight="bold">{contest.eitherNeitherLabel}</Caption>
        </GridLabel>
        <ContestChoiceButton
          choice="yes"
          isSelected={eitherSelected}
          onPress={handleUpdateEitherNeither}
          gridArea="either-option"
          ariaLabel={`${
            eitherSelected
              ? 'Selected, '
              : deselectedOption === 'either'
              ? 'Deselected, '
              : ''
          }${contest.eitherOption.label}`}
          label={contest.eitherOption.label}
        />
        <ContestChoiceButton
          choice="no"
          isSelected={neitherSelected}
          onPress={handleUpdateEitherNeither}
          gridArea="neither-option"
          ariaLabel={`${
            neitherSelected
              ? 'Selected, '
              : deselectedOption === 'neither'
              ? 'Deselected, '
              : ''
          }${contest.neitherOption.label}`}
          label={contest.neitherOption.label}
        />
        <GridLabel
          style={{
            gridArea: 'pick-one-label',
          }}
        >
          <Caption weight="bold">{contest.pickOneLabel}</Caption>
        </GridLabel>
        <ContestChoiceButton
          choice="yes"
          isSelected={firstSelected}
          onPress={handleUpdatePickOne}
          gridArea="first-option"
          ariaLabel={`${
            firstSelected
              ? 'Selected, '
              : deselectedOption === 'first'
              ? 'Deselected, '
              : ''
          }${contest.firstOption.label}`}
          label={contest.firstOption.label}
        />
        <ContestChoiceButton
          choice="no"
          isSelected={secondSelected}
          onPress={handleUpdatePickOne}
          gridArea="second-option"
          ariaLabel={`${
            secondSelected
              ? 'Selected, '
              : deselectedOption === 'second'
              ? 'Deselected, '
              : ''
          }${contest.secondOption.label}`}
          label={contest.secondOption.label}
        />
        <Divider />
      </ChoicesGrid>
    </Main>
  );
}

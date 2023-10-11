import { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  ContestChoiceButton,
  Main,
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
import { BreadcrumbMetadata, ContestHeader } from './contest_header';

const ChoicesGrid = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 0.5rem;
  grid-template:
    'either-neither-label divider pick-one-label' auto
    'either-option divider first-option' auto
    'neither-option divider second-option' auto
    / 1fr calc(0.5rem + 1px) 1fr;
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
  breadcrumbs?: BreadcrumbMetadata;
  election: Election;
  contest: MsEitherNeitherContestInterface;
  eitherNeitherContestVote?: YesNoVote;
  pickOneContestVote?: YesNoVote;
  updateVote: UpdateVoteFunction;
}

export function MsEitherNeitherContest({
  breadcrumbs,
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
    const newVote = currentVote === targetVote ? [] : [targetVote];
    setDeselectedOption(
      currentVote === contest.eitherOption.id
        ? 'either'
        : currentVote === contest.neitherOption.id
        ? 'neither'
        : undefined
    );
    updateVote(contest.eitherNeitherContestId, newVote);
  }
  function handleUpdatePickOne(targetVote: string) {
    const currentVote = pickOneContestVote?.[0];
    const newVote =
      currentVote === targetVote ? ([] as YesNoVote) : [targetVote];
    setDeselectedOption(
      currentVote === contest.firstOption.id
        ? 'first'
        : currentVote === contest.secondOption.id
        ? 'second'
        : undefined
    );
    updateVote(contest.pickOneContestId, newVote);
  }

  const districtName = getContestDistrictName(election, contest);
  const eitherNeitherVote = eitherNeitherContestVote?.[0];
  const forEither = '“for either”';
  const againstBoth = '“against both”';
  const eitherLabel =
    eitherNeitherVote === contest.eitherOption.id ? forEither : againstBoth;
  const pickOneVote = pickOneContestVote?.[0];

  const eitherSelected =
    eitherNeitherContestVote?.[0] === contest.eitherOption.id;
  const neitherSelected =
    eitherNeitherContestVote?.[0] === contest.neitherOption.id;
  const firstSelected = pickOneContestVote?.[0] === contest.firstOption.id;
  const secondSelected = pickOneContestVote?.[0] === contest.secondOption.id;

  useEffect(() => {
    if (deselectedOption) {
      const timer = setTimeout(() => setDeselectedOption(undefined), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedOption]);

  return (
    <Main flexColumn>
      <ContestHeader
        breadcrumbs={breadcrumbs}
        contest={contest}
        districtName={districtName}
      >
        <Caption>
          {eitherNeitherVote && pickOneVote ? (
            <span>
              You have selected {eitherLabel} and your preferred measure.
            </span>
          ) : eitherNeitherVote && !pickOneVote ? (
            <span>
              You have selected {eitherLabel}.{' '}
              {eitherNeitherVote === contest.eitherOption.id ? (
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
      </ContestHeader>
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
          choice={contest.eitherOption.id}
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
          choice={contest.neitherOption.id}
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
          choice={contest.firstOption.id}
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
          choice={contest.secondOption.id}
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

import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  ContestChoiceButton,
  Main,
  Caption,
  WithScrollButtons,
  appStrings,
  AudioOnly,
  electionStrings,
} from '@votingworks/ui';

import {
  YesNoVote,
  Election,
  getContestDistrict,
  YesNoOption,
} from '@votingworks/types';

import { UpdateVoteFunction } from '../config/types';
import { MsEitherNeitherContest as MsEitherNeitherContestInterface } from '../utils/ms_either_neither_contests';
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
    background: ${(p) => p.theme.colors.onBackground};
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

function getVoteStatusText(
  contest: MsEitherNeitherContestInterface,
  votes: { eitherNeitherVote?: string; pickOneVote?: string }
) {
  const { eitherOption, neitherOption, firstOption, secondOption } = contest;
  const { eitherNeitherVote, pickOneVote } = votes;

  if (eitherNeitherVote === eitherOption.id) {
    return pickOneVote
      ? appStrings.noteBmdEitherNeitherSelectedEitherAndPreferred()
      : appStrings.noteBmdEitherNeitherSelectedEither();
  }

  if (eitherNeitherVote === neitherOption.id) {
    return pickOneVote
      ? appStrings.noteBmdEitherNeitherSelectedNeitherAndPreferred()
      : appStrings.noteBmdEitherNeitherSelectedNeither();
  }

  if (pickOneVote === firstOption.id || pickOneVote === secondOption.id) {
    return appStrings.noteBmdEitherNeitherSelectedPreferred();
  }

  return appStrings.noteBmdEitherNeitherNoSelection();
}

export function MsEitherNeitherContest({
  breadcrumbs,
  election,
  contest,
  eitherNeitherContestVote,
  pickOneContestVote,
  updateVote,
}: Props): JSX.Element {
  const [deselectedOptionId, setDeselectedOptionId] = useState<string>();

  function handleUpdateEitherNeither(targetVote: string) {
    const currentVote = eitherNeitherContestVote?.[0];
    const newVote = currentVote === targetVote ? [] : [targetVote];

    if (newVote.length === 0) {
      setDeselectedOptionId(targetVote);
    }

    updateVote(contest.eitherNeitherContestId, newVote);
  }
  function handleUpdatePickOne(targetVote: string) {
    const currentVote = pickOneContestVote?.[0];
    const newVote =
      currentVote === targetVote ? ([] as YesNoVote) : [targetVote];

    if (newVote.length === 0) {
      setDeselectedOptionId(targetVote);
    }

    updateVote(contest.pickOneContestId, newVote);
  }

  const district = getContestDistrict(election, contest);
  const eitherNeitherVote = eitherNeitherContestVote?.[0];
  const pickOneVote = pickOneContestVote?.[0];

  const eitherSelected =
    eitherNeitherContestVote?.[0] === contest.eitherOption.id;
  const neitherSelected =
    eitherNeitherContestVote?.[0] === contest.neitherOption.id;
  const firstSelected = pickOneContestVote?.[0] === contest.firstOption.id;
  const secondSelected = pickOneContestVote?.[0] === contest.secondOption.id;

  useEffect(() => {
    if (deselectedOptionId) {
      const timer = setTimeout(() => setDeselectedOptionId(undefined), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedOptionId]);

  function getOptionLabel(option: YesNoOption): JSX.Element {
    const optionLabel = electionStrings.contestOptionLabel(option);

    const selectedOptionIds = new Set<string>();
    if (eitherNeitherContestVote?.[0]) {
      selectedOptionIds.add(eitherNeitherContestVote[0]);
    }
    if (pickOneContestVote?.[0]) {
      selectedOptionIds.add(pickOneContestVote[0]);
    }

    let audioPrefix: JSX.Element | undefined;
    if (selectedOptionIds.has(option.id)) {
      audioPrefix = appStrings.labelSelected();
    }
    if (deselectedOptionId === option.id) {
      audioPrefix = appStrings.labelDeselected();
    }

    return (
      <React.Fragment>
        {audioPrefix && <AudioOnly>{audioPrefix} </AudioOnly>}
        {optionLabel}
      </React.Fragment>
    );
  }

  return (
    <Main flexColumn>
      <ContestHeader
        breadcrumbs={breadcrumbs}
        contest={contest}
        district={district}
      >
        <Caption>
          {getVoteStatusText(contest, { eitherNeitherVote, pickOneVote })}
        </Caption>
        <AudioOnly>
          {electionStrings.contestDescription(contest.eitherNeitherContest)}{' '}
          {appStrings.instructionsBmdContestNavigation()}
        </AudioOnly>
      </ContestHeader>
      <WithScrollButtons>
        <Caption>
          {electionStrings.contestDescription(contest.eitherNeitherContest)}
        </Caption>
      </WithScrollButtons>
      <ChoicesGrid data-testid="contest-choices">
        <GridLabel
          style={{
            gridArea: 'either-neither-label',
          }}
        >
          <Caption weight="bold">
            {appStrings.labelEitherNeitherContestEitherNeitherSection()}
          </Caption>
        </GridLabel>
        <ContestChoiceButton
          choice={contest.eitherOption.id}
          isSelected={eitherSelected}
          onPress={handleUpdateEitherNeither}
          gridArea="either-option"
          label={getOptionLabel(contest.eitherOption)}
        />
        <ContestChoiceButton
          choice={contest.neitherOption.id}
          isSelected={neitherSelected}
          onPress={handleUpdateEitherNeither}
          gridArea="neither-option"
          label={getOptionLabel(contest.neitherOption)}
        />
        <GridLabel
          style={{
            gridArea: 'pick-one-label',
          }}
        >
          <Caption weight="bold">
            {appStrings.labelEitherNeitherContestPickOneSection()}
          </Caption>
        </GridLabel>
        <ContestChoiceButton
          choice={contest.firstOption.id}
          isSelected={firstSelected}
          onPress={handleUpdatePickOne}
          gridArea="first-option"
          label={getOptionLabel(contest.firstOption)}
        />
        <ContestChoiceButton
          choice={contest.secondOption.id}
          isSelected={secondSelected}
          onPress={handleUpdatePickOne}
          gridArea="second-option"
          label={getOptionLabel(contest.secondOption)}
        />
        <Divider />
      </ChoicesGrid>
    </Main>
  );
}

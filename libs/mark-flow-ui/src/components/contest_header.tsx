import React from 'react';
import styled from 'styled-components';

import {
  Caption,
  FocusableAudio,
  H2,
  NumberString,
  appStrings,
  electionStrings,
} from '@votingworks/ui';
import { Contest, District } from '@votingworks/types';
import { MsEitherNeitherContest } from '../utils/ms_either_neither_contests';

export interface ContestHeaderProps {
  children?: React.ReactNode;
  contest: Contest | MsEitherNeitherContest;
  district: District;
  className?: string;
}

export interface BreadcrumbMetadata {
  ballotContestCount: number;
  contestNumber: number;
}

const Container = styled.div`
  padding: 0.25rem 0.5rem 0.5rem;

  &.no-horizontal-padding {
    padding-left: 0;
    padding-right: 0;
  }
`;

const Title = styled(H2)`
  margin-bottom: 0.125rem;
`;

export function Breadcrumbs(props: BreadcrumbMetadata): React.ReactNode {
  const { ballotContestCount, contestNumber } = props;

  return (
    <Caption noWrap>
      {appStrings.labelContestNumber()}{' '}
      <NumberString weight="bold" value={contestNumber} />
      {ballotContestCount && (
        <React.Fragment>
          {' '}
          | {appStrings.labelTotalContests()}{' '}
          <NumberString weight="bold" value={ballotContestCount} />{' '}
        </React.Fragment>
      )}
    </Caption>
  );
}

export function ContestHeader(props: ContestHeaderProps): JSX.Element {
  const { children, contest, district, className } = props;

  return (
    <Container id="contest-header" className={className}>
      {/*
       * Rendered as a `FocusableAudio` block so that, in addition to being read
       * on contest navigation, the contest metadata stays in the accessible
       * navigation order and voters can navigate back to it to replay the audio
       * without leaving and re-entering the contest.
       */}
      <FocusableAudio readOnLoad showFocusIndicator>
        <div>
          <Caption weight="semiBold">
            {electionStrings.districtName(district)}
          </Caption>
        </div>
        <div>
          <Title>{electionStrings.contestTitle(contest)}</Title>
        </div>
        {children}
      </FocusableAudio>
    </Container>
  );
}

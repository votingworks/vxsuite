import React from 'react';
import styled from 'styled-components';

import {
  Caption,
  Font,
  H2,
  appStrings,
  electionStrings,
} from '@votingworks/ui';
import { Contest, District } from '@votingworks/types';
import { MsEitherNeitherContest } from '../utils/ms_either_neither_contests';

export interface ContestHeaderProps {
  breadcrumbs?: BreadcrumbMetadata;
  children?: React.ReactNode;
  contest: Contest | MsEitherNeitherContest;
  district: District;
}

export interface BreadcrumbMetadata {
  ballotContestCount: number;
  contestNumber: number;
}

const Container = styled.div`
  padding: 0.25rem 0.5rem 0.5rem;
`;

const ContestInfo = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
`;

function Breadcrumbs(props: BreadcrumbMetadata) {
  const { ballotContestCount, contestNumber } = props;

  return (
    <Caption noWrap>
      {appStrings.labelContestNumber()}{' '}
      <Font weight="bold">{contestNumber}</Font> |{' '}
      {appStrings.labelTotalContests()}{' '}
      <Font weight="bold">{ballotContestCount}</Font>{' '}
    </Caption>
  );
}

export function ContestHeader(props: ContestHeaderProps): JSX.Element {
  const { breadcrumbs, children, contest, district } = props;

  return (
    <Container id="contest-header">
      <div id="audiofocus">
        <ContestInfo>
          <Caption weight="semiBold">
            {electionStrings.districtName(district)}
          </Caption>
          {breadcrumbs && <Breadcrumbs {...breadcrumbs} />}
        </ContestInfo>
        <div>
          <H2 as="h1">{electionStrings.contestTitle(contest)}</H2>
        </div>
        {children}
      </div>
    </Container>
  );
}

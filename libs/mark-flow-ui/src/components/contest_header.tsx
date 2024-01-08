import React from 'react';
import styled from 'styled-components';

import {
  Caption,
  H2,
  NumberString,
  ReadOnLoad,
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
  flex-direction: row-reverse;
  gap: 0.5rem;
  justify-content: space-between;
`;

function Breadcrumbs(props: BreadcrumbMetadata) {
  const { ballotContestCount, contestNumber } = props;

  return (
    <Caption noWrap>
      {appStrings.labelContestNumber()}{' '}
      <NumberString weight="bold" value={contestNumber} /> |{' '}
      {appStrings.labelTotalContests()}{' '}
      <NumberString weight="bold" value={ballotContestCount} />{' '}
    </Caption>
  );
}

export function ContestHeader(props: ContestHeaderProps): JSX.Element {
  const { breadcrumbs, children, contest, district } = props;

  return (
    <Container id="contest-header">
      <ReadOnLoad>
        <ContestInfo>
          {breadcrumbs && <Breadcrumbs {...breadcrumbs} />}
          <Caption weight="semiBold">
            {electionStrings.districtName(district)}
          </Caption>
        </ContestInfo>
        <div>
          <H2 as="h1">{electionStrings.contestTitle(contest)}</H2>
        </div>
        {children}
      </ReadOnLoad>
    </Container>
  );
}

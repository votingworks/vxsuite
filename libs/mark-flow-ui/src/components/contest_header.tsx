import React from 'react';
import styled from 'styled-components';

import {
  AudioOnly,
  Caption,
  H2,
  NumberString,
  ReadOnLoad,
  appStrings,
  electionStrings,
} from '@votingworks/ui';
import { Contest, District } from '@votingworks/types';
import { MsEitherNeitherContest } from '../utils/ms_either_neither_contests';

interface ContainerProps {
  horizontalPadding?: boolean;
}

export interface ContestHeaderProps {
  breadcrumbs?: BreadcrumbMetadata;
  children?: React.ReactNode;
  contest: Contest | MsEitherNeitherContest;
  district: District;
  styleOverrides?: ContainerProps;
}

export interface BreadcrumbMetadata {
  ballotContestCount: number;
  contestNumber: number;
}

const Container = styled.div<ContainerProps>`
  padding: 0.25rem ${(p) => (p.horizontalPadding ? '0.5rem' : '0')} 0.5rem;
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
  const {
    breadcrumbs,
    children,
    contest,
    district,
    styleOverrides = { horizontalPadding: true },
  } = props;

  return (
    <Container id="contest-header" {...styleOverrides}>
      <ReadOnLoad>
        {/*
         * NOTE: This is visually rendered elsewhere in the screen footer, but
         * needs to be spoken on contest navigation for the benefit of
         * vision-impaired voters:
         */}
        {breadcrumbs && (
          <AudioOnly>
            <Breadcrumbs {...breadcrumbs} />
          </AudioOnly>
        )}
        <div>
          <Caption weight="semiBold">
            {electionStrings.districtName(district)}
          </Caption>
        </div>
        <div>
          <H2 as="h1">{electionStrings.contestTitle(contest)}</H2>
        </div>
        {children}
      </ReadOnLoad>
    </Container>
  );
}

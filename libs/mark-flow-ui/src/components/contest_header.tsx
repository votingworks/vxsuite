import React from 'react';
import styled from 'styled-components';

import {
  AudioOnly,
  Caption,
  H2,
  NumberString,
  ReadOnLoad,
  TextOnly,
  UiStringsReactQueryApi,
  appStrings,
  electionStrings,
} from '@votingworks/ui';
import { Contest, District, ElectionStringKey } from '@votingworks/types';
import getDeepValue from 'lodash.get';
import { MsEitherNeitherContest } from '../utils/ms_either_neither_contests';

export interface ContestHeaderProps {
  breadcrumbs?: BreadcrumbMetadata;
  children?: React.ReactNode;
  contest: Contest | MsEitherNeitherContest;
  district: District;
  className?: string;
  uiStringsApi: UiStringsReactQueryApi;
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

export function ContestHeader(props: ContestHeaderProps): React.ReactNode {
  const { breadcrumbs, children, contest, district, className, uiStringsApi } =
    props;

  const audioIdsQuery = uiStringsApi.getAudioIds.useQuery('en');
  const hasContestAudioOverride = !!getDeepValue(
    audioIdsQuery.data,
    `${ElectionStringKey.LA_CONTEST_AUDIO}.${contest.id}`
  );

  if (audioIdsQuery.isLoading) return null;

  return (
    <Container id="contest-header" className={className}>
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
          {hasContestAudioOverride ? (
            <TextOnly>
              <Caption weight="semiBold">
                {electionStrings.districtName(district)}
              </Caption>
            </TextOnly>
          ) : (
            <Caption weight="semiBold">
              {electionStrings.districtName(district)}
            </Caption>
          )}
        </div>
        <div>
          {hasContestAudioOverride ? (
            <React.Fragment>
              <AudioOnly>{electionStrings.laContestAudio(contest)}</AudioOnly>
              <div>
                <TextOnly>
                  <H2 as="h1">{electionStrings.contestTitle(contest)}</H2>
                </TextOnly>
              </div>
            </React.Fragment>
          ) : (
            <H2 as="h1">{electionStrings.contestTitle(contest)}</H2>
          )}
        </div>
        {children}
      </ReadOnLoad>
    </Container>
  );
}

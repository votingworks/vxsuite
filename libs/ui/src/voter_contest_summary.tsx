import React from 'react';
import styled from 'styled-components';

import { Checkbox } from './checkbox';
import { Icons } from './icons';
import { Caption, Font, H5, HeadingProps, P } from './typography';

export interface VoterContestSummaryProps {
  districtName: React.ReactNode;
  title: React.ReactNode;
  titleType: HeadingProps['as'];
  undervoteWarning?: React.ReactNode;
  votes: ContestVote[];
  'data-testid'?: string;
}

export interface ContestVote {
  caption?: React.ReactNode;
  id: string;
  label: React.ReactNode;
}

const ListContainer = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const DistrictName = styled(Caption)`
  display: block;
  margin-bottom: 0;
`;

const VoteInfo = styled.li`
  align-items: start;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.25rem;
  margin-bottom: 0.25rem;
`;

const CheckboxContainer = styled(Font)`
  font-size: 0.65rem;
`;

/** Vote summary list for a single contest, for a single voter session. */
export function VoterContestSummary(
  props: VoterContestSummaryProps
): JSX.Element {
  const {
    districtName,
    title,
    titleType,
    undervoteWarning,
    votes,
    'data-testid': testId,
  } = props;

  return (
    <div data-testid={testId}>
      <H5 as={titleType}>
        <DistrictName weight="regular">{districtName}</DistrictName>
        {title}
      </H5>
      {undervoteWarning && (
        <P>
          <Caption>
            <Icons.Warning color="warning" /> {undervoteWarning}
          </Caption>
        </P>
      )}
      <ListContainer>
        {votes.map((v) => (
          <VoteInfo key={v.id}>
            <CheckboxContainer>
              <Checkbox checked />
            </CheckboxContainer>
            <span>
              <Font weight="semiBold">{v.label}</Font>
              <br />
              {v.caption && <Caption noWrap> {v.caption}</Caption>}
            </span>
          </VoteInfo>
        ))}
      </ListContainer>
    </div>
  );
}

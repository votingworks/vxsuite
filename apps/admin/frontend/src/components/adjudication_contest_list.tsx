import React from 'react';
import styled from 'styled-components';
import {
  AnyContest,
  ContestId,
  Election,
  getContestDistrictName,
} from '@votingworks/types';
import type { CvrContestTag } from '@votingworks/admin-backend';
import { Button, Icons } from '@votingworks/ui';
import { EntityList } from './entity_list';

const Column = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0;
`;

export interface AdjudicationContestListProps {
  frontContests: AnyContest[];
  backContests: AnyContest[];
  election: Election;
  tagsByContestId: Map<ContestId, CvrContestTag | null>;
  selectedContestId: ContestId | null;
  onSelect: (contestId: ContestId) => void;
}

function getAdjudicationReasons(tag?: CvrContestTag  ): string[] {
  if (!tag) return [];
  const reasons: string[] = [];
  if (tag.hasWriteIn) reasons.push('Write-In');
  if (tag.hasOvervote) reasons.push('Overvote');
  if (tag.hasUndervote) reasons.push('Undervote');
  if (tag.hasMarginalMark) reasons.push('Marginal Mark');
  return reasons;
}

function ContestSublist({
  contests,
  election,
  tagsByContestId,
  onSelect,
  selectedContestId,
  title,
  firstUnresolvedContestId,
}: {
  contests: AnyContest[];
  election: Election;
  tagsByContestId: Map<ContestId, CvrContestTag | null>;
  onSelect: (contestId: ContestId) => void;
  selectedContestId: ContestId | null;
  title: string;
  firstUnresolvedContestId?: ContestId  ;
}): React.ReactNode {
  return (
    <React.Fragment>
      <EntityList.Header>{title}</EntityList.Header>
      <EntityList.Items>
        {contests.map((contest) => {
          const tag = tagsByContestId.get(contest.id);
          const reasons = tag ? getAdjudicationReasons(tag) : [];
          const isResolved = !tag || tag.isResolved;
          const isFirstUnresolved = contest.id === firstUnresolvedContestId;
          return (
            <EntityList.Item
              id={contest.id}
              key={contest.id}
              selected={selectedContestId === contest.id}
              onSelect={onSelect}
              autoScrollIntoView={isFirstUnresolved}
            >
              <Column>
                {reasons.length > 0 && (
                  <EntityList.Caption weight="semiBold">
                    {reasons.join(', ')}
                  </EntityList.Caption>
                )}
                <EntityList.Caption>
                  {getContestDistrictName(election, contest)}
                </EntityList.Caption>
                <EntityList.Label weight="semiBold">
                  {contest.title}
                </EntityList.Label>
              </Column>
              {isResolved && <Icons.Done color="success" />}
              {isFirstUnresolved && (
                <Button
                  variant="primary"
                  onPress={() => onSelect(contest.id)}
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                >
                  Start
                </Button>
              )}
            </EntityList.Item>
          );
        })}
      </EntityList.Items>
    </React.Fragment>
  );
}

export function AdjudicationContestList(
  props: AdjudicationContestListProps
): React.ReactNode {
  const {
    frontContests,
    backContests,
    election,
    tagsByContestId,
    selectedContestId,
    onSelect,
  } = props;

  const allContests = [...frontContests, ...backContests];
  const firstUnresolvedContestId = allContests.find((c) => {
    const tag = tagsByContestId.get(c.id);
    return tag && !tag.isResolved;
  })?.id;

  return (
    <EntityList.Box>
      {frontContests.length > 0 && (
        <ContestSublist
          contests={frontContests}
          election={election}
          tagsByContestId={tagsByContestId}
          onSelect={onSelect}
          selectedContestId={selectedContestId}
          title="Front"
          firstUnresolvedContestId={firstUnresolvedContestId}
        />
      )}
      {backContests.length > 0 && (
        <ContestSublist
          contests={backContests}
          election={election}
          tagsByContestId={tagsByContestId}
          onSelect={onSelect}
          selectedContestId={selectedContestId}
          title="Back"
          firstUnresolvedContestId={firstUnresolvedContestId}
        />
      )}
    </EntityList.Box>
  );
}

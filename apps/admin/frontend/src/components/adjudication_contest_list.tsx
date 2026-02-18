import React from 'react';
import styled from 'styled-components';
import {
  AnyContest,
  ContestId,
  Election,
  getContestDistrictName,
  Side,
} from '@votingworks/types';
import type { CvrContestTag } from '@votingworks/admin-backend';
import { DesktopPalette, Icons } from '@votingworks/ui';
import { EntityList } from './entity_list';

const Column = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0;
`;

const ClickableHeader = styled.button`
  all: unset;
  cursor: pointer;
  width: 100%;
`;

const ResolvedCaption = styled(EntityList.Caption)`
  color: ${DesktopPalette.Purple70};
`;

function getAdjudicationReasons(tag?: CvrContestTag): string[] {
  if (!tag) return [];
  const reasons: string[] = [];
  if (tag.hasOvervote) reasons.push('Overvote');
  if (tag.hasWriteIn) reasons.push('Write-In');
  if (tag.hasUndervote) reasons.push('Undervote');
  if (tag.hasMarginalMark) reasons.push('Marginal Mark');
  return reasons;
}

export interface AdjudicationContestListProps {
  frontContests: AnyContest[];
  backContests: AnyContest[];
  election: Election;
  tagsByContestId: Map<ContestId, CvrContestTag | null>;
  onSelect: (contestId: ContestId) => void;
  onHover?: (contestId: ContestId | null) => void;
  onSelectSide: (side: Side) => void;
}

function ContestSublist({
  contests,
  election,
  tagsByContestId,
  onSelect,
  onHover,
  title,
  firstUnresolvedContestId,
  onHeaderClick,
}: {
  contests: AnyContest[];
  election: Election;
  tagsByContestId: Map<ContestId, CvrContestTag | null>;
  onSelect: (contestId: ContestId) => void;
  onHover?: (contestId: ContestId | null) => void;
  title: string;
  firstUnresolvedContestId?: ContestId;
  onHeaderClick?: () => void;
}): React.ReactNode {
  return (
    <React.Fragment>
      {onHeaderClick ? (
        <ClickableHeader type="button" onClick={onHeaderClick}>
          <EntityList.Header>{title}</EntityList.Header>
        </ClickableHeader>
      ) : (
        <EntityList.Header>{title}</EntityList.Header>
      )}
      <EntityList.Items>
        {contests.map((contest) => {
          const tag = tagsByContestId.get(contest.id);
          const reasons = tag ? getAdjudicationReasons(tag).slice(0, 1) : [];
          const isPending = tag && !tag.isResolved;
          const isResolved = tag && tag.isResolved;
          const isFirstUnresolved = contest.id === firstUnresolvedContestId;
          return (
            <EntityList.Item
              id={contest.id}
              key={contest.id}
              selected={false} // isFirstUnresolved || selectedContestId === contest.id}
              onSelect={onSelect}
              onHover={onHover}
              autoScrollIntoView={isFirstUnresolved}
            >
              <Column>
                <EntityList.Caption>
                  {getContestDistrictName(election, contest)}
                </EntityList.Caption>
                <EntityList.Label weight="semiBold">
                  {contest.title}
                </EntityList.Label>
                {isResolved && (
                  <ResolvedCaption weight="semiBold">
                    Resolved: {reasons.join(', ')}
                  </ResolvedCaption>
                )}
              </Column>
              {isPending && <Icons.Warning color="warning" />}
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
    onSelect,
    onHover,
    onSelectSide,
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
          onHover={onHover}
          title="Front"
          firstUnresolvedContestId={firstUnresolvedContestId}
          onHeaderClick={() => onSelectSide('front')}
        />
      )}
      {backContests.length > 0 && (
        <ContestSublist
          contests={backContests}
          election={election}
          tagsByContestId={tagsByContestId}
          onSelect={onSelect}
          onHover={onHover}
          title="Back"
          firstUnresolvedContestId={firstUnresolvedContestId}
          onHeaderClick={() => onSelectSide('back')}
        />
      )}
    </EntityList.Box>
  );
}

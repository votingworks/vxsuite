import React from 'react';
import styled from 'styled-components';
import { Button } from '@votingworks/ui';
import type { Contest, ContestId, ElectionId, Party } from '@votingworks/types';
import { groupBy } from '@votingworks/basics';
import { useElectionDefinitionApi } from './election_definition_context.js';
import { EntityList } from './entity_list.js';
import { Column, Row } from './layout.js';
import { useReorderAnimation } from './use_reorder_animation.js';

const CLASS_REORDER_BUTTON = 'contestReorderButton';

const Item = styled(EntityList.Item)`
  .${CLASS_REORDER_BUTTON} {
    padding: 0.55rem;
  }
`;

const Items = styled(EntityList.Items)`
  :not(:last-child) {
    ${Item}:last-child {
      border-bottom: none;
    }
  }
`;

export interface ReorderParams {
  id: string;
  direction: -1 | 1;
}

export interface ContestListProps {
  contests: readonly Contest[];
  electionId: ElectionId;
  onSelect: (contestId: ContestId) => void;
  reordering: boolean;
  reorder: (params: ReorderParams) => void;
  selectedId?: ContestId;
}

// [TODO] Might make sense, visually and functionally, to move the controls for
// enabling/saving contest reordering into this component, maybe as a persistent
// footer. With recent changes the "reorder" button is a bit too far off now and
// there may be plans to add support for custom contest grouping down the line.
export function ContestList(props: ContestListProps): React.ReactNode {
  const { contests, electionId, onSelect, reorder, reordering, selectedId } =
    props;

  const api = useElectionDefinitionApi();
  const parties = api.listParties.useQuery(electionId);
  const districts = api.listDistricts.useQuery(electionId);

  const districtIdToName = React.useMemo(
    () => new Map((districts.data || []).map((d) => [d.id, d.name])),
    [districts.data]
  );

  if (!parties.isSuccess || !districts.isSuccess) {
    return null;
  }

  const contestsByType: Partial<Record<Contest['type'], Contest[]>> =
    Object.fromEntries(groupBy(contests, (contest) => contest.type));
  const sections: Array<[string, Contest[] | undefined]> = [
    ['Straight Party', contestsByType['straight-party']],
    ['Candidate Contests', contestsByType['candidate']],
    ['Ballot Measures', contestsByType['yesno']],
  ];

  return (
    <EntityList.Box>
      {sections.map(
        ([title, sectionContests]) =>
          sectionContests && (
            <Sublist
              key={title}
              contests={sectionContests}
              districtIdToName={districtIdToName}
              onSelect={onSelect}
              parties={parties.data}
              reordering={reordering}
              reorder={reorder}
              selectedId={selectedId}
              title={title}
            />
          )
      )}
    </EntityList.Box>
  );
}

export function Sublist(props: {
  contests: Contest[];
  districtIdToName: Map<string, string>;
  onSelect: (contestId: string) => void;
  parties: readonly Party[];
  reorder: (params: ReorderParams) => void;
  reordering: boolean;
  selectedId?: ContestId;
  title: string;
}): React.ReactNode {
  const {
    contests,
    districtIdToName,
    onSelect,
    parties,
    reorder,
    reordering,
    selectedId,
    title,
  } = props;

  const itemsRef = useReorderAnimation(
    contests.map((c) => c.id),
    reordering
  );

  return (
    <React.Fragment>
      <EntityList.Header>{title}</EntityList.Header>

      <Items ref={itemsRef}>
        {contests.map((c, index) => (
          <Item
            id={c.id}
            key={c.id}
            selected={selectedId === c.id}
            onSelect={onSelect}
          >
            <Column style={{ flexGrow: 1 }}>
              <EntityList.Caption weight="semiBold">
                {partyName(c, parties)}
              </EntityList.Caption>

              <EntityList.Caption>
                {districtIdToName.get(c.districtId)}
              </EntityList.Caption>

              <EntityList.Label>{c.title}</EntityList.Label>
            </Column>

            {reordering && (
              <Row style={{ gap: '0.5rem', justifyContent: 'flex-end' }}>
                <Button
                  aria-label={`Move Up: ${c.title}`}
                  icon="ChevronUp"
                  className={CLASS_REORDER_BUTTON}
                  disabled={index === 0}
                  disableEventPropagation
                  onPress={reorder}
                  value={{ id: c.id, direction: -1 }}
                />
                <Button
                  aria-label={`Move Down: ${c.title}`}
                  icon="ChevronDown"
                  className={CLASS_REORDER_BUTTON}
                  disabled={index === contests.length - 1}
                  disableEventPropagation
                  onPress={reorder}
                  value={{ id: c.id, direction: 1 }}
                />
              </Row>
            )}
          </Item>
        ))}
      </Items>
    </React.Fragment>
  );
}

function partyName(contest: Contest, parties: readonly Party[]) {
  if (contest.type !== 'candidate' || !contest.partyId) return undefined;

  return parties.find((p) => p.id === contest.partyId)?.fullName;
}

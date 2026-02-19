import React from 'react';
import styled from 'styled-components';
import { Flipped, Flipper } from 'react-flip-toolkit';
import { Button } from '@votingworks/ui';
import { AnyContest, Party } from '@votingworks/types';
import { useHistory, useParams } from 'react-router-dom';
import { Column, Row } from './layout';
import * as api from './api';
import { ElectionIdParams, routes } from './routes';
import { EntityList } from './entity_list';

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
  straightPartyContests: AnyContest[];
  candidateContests: AnyContest[];
  yesNoContests: AnyContest[];
  reordering: boolean;
  reorder: (params: ReorderParams) => void;
}

// [TODO] Might make sense, visually and functionally, to move the controls for
// enabling/saving contest reordering into this component, maybe as a persistent
// footer. With recent changes the "reorder" button is a bit too far off now and
// there may be plans to add support for custom contest grouping down the line.
export function ContestList(props: ContestListProps): React.ReactNode {
  const {
    straightPartyContests,
    candidateContests,
    yesNoContests,
    reorder,
    reordering,
  } = props;
  const { contestId = null, electionId } = useParams<
    ElectionIdParams & { contestId?: string }
  >();

  const history = useHistory();
  const contestRoutes = routes.election(electionId).contests;

  const parties = api.listParties.useQuery(electionId);
  const districts = api.listDistricts.useQuery(electionId);

  const districtIdToName = React.useMemo(
    () => new Map((districts.data || []).map((d) => [d.id, d.name])),
    [districts.data]
  );

  function onSelect(id: string) {
    history.push(contestRoutes.view(id).path);
  }

  if (!parties.isSuccess || !districts.isSuccess) {
    return null;
  }

  return (
    <EntityList.Box>
      {straightPartyContests.length > 0 && (
        <Sublist
          contests={straightPartyContests}
          districtIdToName={districtIdToName}
          onSelect={onSelect}
          parties={parties.data}
          reordering={false}
          reorder={reorder}
          selectedId={contestId}
          title="Straight Party"
        />
      )}
      {candidateContests.length > 0 && (
        <Sublist
          contests={candidateContests}
          districtIdToName={districtIdToName}
          onSelect={onSelect}
          parties={parties.data}
          reordering={reordering}
          reorder={reorder}
          selectedId={contestId}
          title="Candidate Contests"
        />
      )}
      {yesNoContests.length > 0 && (
        <Sublist
          contests={yesNoContests}
          districtIdToName={districtIdToName}
          onSelect={onSelect}
          parties={parties.data}
          reordering={reordering}
          reorder={reorder}
          selectedId={contestId}
          title="Ballot Measures"
        />
      )}
    </EntityList.Box>
  );
}

export function Sublist(props: {
  contests: AnyContest[];
  districtIdToName: Map<string, string>;
  onSelect: (contestId: string) => void;
  parties: readonly Party[];
  reorder: (params: ReorderParams) => void;
  reordering: boolean;
  selectedId: string | null;
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

  return (
    <React.Fragment>
      <EntityList.Header>{title}</EntityList.Header>

      {/* Flipper/Flip are used to animate the reordering of contest rows */}
      <Items
        // @ts-expect-error: TS doesn't think Flipper is a valid component
        as={Flipper}
        flipKey={contests.map((c) => c.id).join(',')}
        // Custom spring parameters to speed up the duration of the animation
        // See https://github.com/aholachek/react-flip-toolkit/issues/100#issuecomment-551056183
        spring={{ stiffness: 439, damping: 42 }}
      >
        {contests.map((c, index) => (
          <Flipped key={c.id} flipId={c.id} shouldFlip={() => reordering}>
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
                  {c.type === 'straight-party'
                    ? 'Election-wide'
                    : districtIdToName.get(c.districtId)}
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
          </Flipped>
        ))}
      </Items>
    </React.Fragment>
  );
}

function partyName(contest: AnyContest, parties: readonly Party[]) {
  if (contest.type !== 'candidate' || !contest.partyId) return undefined;

  return parties.find((p) => p.id === contest.partyId)?.fullName;
}

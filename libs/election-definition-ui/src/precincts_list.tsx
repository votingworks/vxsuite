import React from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';

import { Icons, DesktopPalette, Callout } from '@votingworks/ui';
import {
  type ElectionId,
  hasSplits,
  type PrecinctId,
} from '@votingworks/types';

import { useElectionDefinitionApi } from './election_definition_context.js';
import { EntityList } from './entity_list.js';
import { Column } from './layout.js';
import type { ListDetailRoutes } from './list_detail_routes.js';

const NoPrecincts = styled.div`
  padding: 1rem;
`;

const SplitIcon = styled(Icons.Split)<{ selected: boolean }>`
  color: ${(p) =>
    p.selected ? p.theme.colors.primary : DesktopPalette.Purple60};
  transform: rotate(-90deg) scale(1, -1);
`;

export interface PrecinctListProps {
  electionId: ElectionId;
  precinctRoutes: ListDetailRoutes;
}

export function PrecinctList(props: PrecinctListProps): JSX.Element | null {
  const { electionId, precinctRoutes } = props;
  const { precinctId } = useParams<{ precinctId?: PrecinctId }>();
  const precincts =
    useElectionDefinitionApi().listPrecincts.useQuery(electionId);

  const history = useHistory();

  if (!precincts.isSuccess) return null;

  function onSelect(id: string) {
    history.push(precinctRoutes.viewUrl(id));
  }

  const { Box, Caption, Item, Items, Label } = EntityList;

  return (
    <React.Fragment>
      {precincts.data.length === 0 && (
        <NoPrecincts>
          <Callout color="neutral" icon="Info">
            You haven&apos;t added any precincts to this election yet.
          </Callout>
        </NoPrecincts>
      )}
      {precincts.data.length > 0 && (
        <Box>
          <Items>
            {precincts.data.map((p) => (
              <Item
                id={p.id}
                key={p.id}
                onSelect={onSelect}
                selected={p.id === precinctId}
              >
                <Column>
                  <Label>{p.name}</Label>

                  {hasSplits(p) ? (
                    <Caption noWrap weight="bold">
                      <SplitIcon selected={p.id === precinctId} />{' '}
                      {p.splits.length} Splits
                    </Caption>
                  ) : (
                    <Caption noWrap>
                      {p.districtIds.length === 1
                        ? `${p.districtIds.length} District`
                        : `${p.districtIds.length} Districts`}
                    </Caption>
                  )}
                </Column>
              </Item>
            ))}
          </Items>
        </Box>
      )}
    </React.Fragment>
  );
}

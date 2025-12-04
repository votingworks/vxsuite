import React from 'react';
import { useHistory, useParams } from 'react-router-dom';

import { Icons, DesktopPalette, Callout } from '@votingworks/ui';
import { hasSplits } from '@votingworks/types';

import styled from 'styled-components';
import { ElectionIdParams, routes } from './routes';
import { Column } from './layout';
import { listPrecincts } from './api';
import { EntityList } from './entity_list';

const NoPrecincts = styled.div`
  padding: 1rem;
`;

export function PrecinctList(): React.ReactNode {
  const { electionId, precinctId } = useParams<
    ElectionIdParams & { precinctId?: string }
  >();
  const precinctRoutes = routes.election(electionId).precincts2;
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);

  const history = useHistory();

  if (!listPrecinctsQuery.isSuccess) return null;

  const precincts = listPrecinctsQuery.data;

  function onSelect(id: string) {
    history.push(precinctRoutes.view(id).path);
  }

  return (
    <React.Fragment>
      {precincts.length === 0 && (
        <NoPrecincts>
          <Callout color="neutral" icon="Info">
            You haven&apos;t added any precincts to this election yet.
          </Callout>
        </NoPrecincts>
      )}
      {precincts.length > 0 && (
        <EntityList.Box>
          <EntityList.Items>
            {precincts.map((precinct) => (
              <EntityList.Item
                id={precinct.id}
                key={precinct.id}
                onSelect={onSelect}
                selected={precinctId === precinct.id}
              >
                <Column>
                  <EntityList.Label>{precinct.name}</EntityList.Label>
                  {hasSplits(precinct) ? (
                    <EntityList.Caption noWrap weight="semiBold">
                      <Icons.Split
                        style={{
                          color:
                            precinctId === precinct.id
                              ? DesktopPalette.Purple80
                              : DesktopPalette.Purple70,
                          transform: 'rotate(-90deg) scale(1, -1)',
                        }}
                      />{' '}
                      {precinct.splits.length} Splits
                    </EntityList.Caption>
                  ) : (
                    <EntityList.Caption noWrap>
                      {precinct.districtIds.length === 1
                        ? `${precinct.districtIds.length} District`
                        : `${precinct.districtIds.length} Districts`}
                    </EntityList.Caption>
                  )}
                </Column>
              </EntityList.Item>
            ))}
          </EntityList.Items>
        </EntityList.Box>
      )}
    </React.Fragment>
  );
}

import React from 'react';
import { useParams } from 'react-router-dom';

import { Table, TH, TD, LinkButton, P } from '@votingworks/ui';
import { hasSplits } from '@votingworks/types';

import { ElectionIdParams, routes } from './routes';
import { NestedTr, TableActionsRow } from './layout';
import { getBallotsFinalizedAt, listDistricts, listPrecincts } from './api';

export function PrecinctList(): React.ReactNode {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctRoutes = routes.election(electionId).precincts;
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (
    !listPrecinctsQuery.isSuccess ||
    !listDistrictsQuery.isSuccess ||
    !getBallotsFinalizedAtQuery.isSuccess
  ) {
    return null;
  }

  const precincts = listPrecinctsQuery.data;
  const districts = listDistrictsQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;

  const districtIdToName = new Map(
    districts.map((district) => [district.id, district.name])
  );

  return (
    <React.Fragment>
      {precincts.length === 0 && (
        <P>You haven&apos;t added any precincts to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton
          variant="primary"
          icon="Add"
          to={precinctRoutes.add.path}
          disabled={!!ballotsFinalizedAt}
        >
          Add Precinct
        </LinkButton>
      </TableActionsRow>
      {precincts.length > 0 && (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH>Districts</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {precincts.flatMap((precinct) => {
              const precinctRow = (
                <tr key={precinct.id}>
                  <TD>{precinct.name}</TD>
                  <TD>
                    {'districtIds' in precinct &&
                      precinct.districtIds
                        .map((districtId) => districtIdToName.get(districtId))
                        .join(', ')}
                  </TD>
                  <TD>
                    <LinkButton
                      icon="Edit"
                      to={precinctRoutes.edit(precinct.id).path}
                      disabled={!!ballotsFinalizedAt}
                    >
                      Edit
                    </LinkButton>
                  </TD>
                </tr>
              );
              if (!hasSplits(precinct)) {
                return [precinctRow];
              }

              const splitRows = precinct.splits.map((split) => (
                <NestedTr key={split.id}>
                  <TD>{split.name}</TD>
                  <TD>
                    {split.districtIds
                      .map((districtId) => districtIdToName.get(districtId))
                      .join(', ')}
                  </TD>
                  <TD />
                </NestedTr>
              ));
              return [precinctRow, ...splitRows];
            })}
          </tbody>
        </Table>
      )}
    </React.Fragment>
  );
}

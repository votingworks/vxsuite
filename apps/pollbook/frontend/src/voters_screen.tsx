import { MainContent, Font, H1, LinkButton, Icons } from '@votingworks/ui';
import React, { useState } from 'react';
import type { Voter, VoterSearchParams } from '@votingworks/pollbook-backend';
import { useHistory } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';
import { DateTime } from 'luxon';
import { getDeviceStatuses, getElection } from './api';
import { Column, Row } from './layout';
import { ElectionManagerNavScreen } from './nav_screen';
import { VoterSearch, createEmptySearchParams } from './voter_search_screen';
import { ExportVoterActivityButton } from './export_voter_activity';

function getDetailsPageUrl(voter: Voter): string {
  return `/voters/${voter.voterId}`;
}

export function ElectionManagerVotersScreen(): JSX.Element | null {
  const history = useHistory();
  const [search, setSearch] = useState<VoterSearchParams>(
    createEmptySearchParams(false)
  );
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const getElectionQuery = getElection.useQuery();

  if (!getDeviceStatusesQuery.isSuccess || !getElectionQuery.isSuccess) {
    /* istanbul ignore next - @preserve */
    return null;
  }

  const election = assertDefined(getElectionQuery.data.unsafeUnwrap());

  return (
    <ElectionManagerNavScreen
      title={
        <Row style={{ justifyContent: 'space-between', width: '100%' }}>
          <H1>Voters</H1>
          <ExportVoterActivityButton />
        </Row>
      }
    >
      <MainContent>
        <VoterSearch
          search={search}
          election={election}
          setSearch={setSearch}
          onBarcodeScanMatch={(voter) => {
            /* istanbul ignore next - @preserve */
            setSearch(createEmptySearchParams(true));
            /* istanbul ignore next - @preserve */
            history.push(getDetailsPageUrl(voter));
          }}
          renderAction={(voter) => (
            <Column style={{ gap: '0.5rem' }}>
              {voter.checkIn ? (
                <React.Fragment>
                  <span>
                    <Icons.Done /> Checked In
                  </span>
                  <span>
                    {DateTime.fromISO(voter.checkIn.timestamp).toLocaleString(
                      DateTime.TIME_SIMPLE
                    )}{' '}
                    • {voter.checkIn.machineId}
                  </span>
                </React.Fragment>
              ) : (
                <span>
                  <Icons.Info /> Not Checked In
                </span>
              )}

              <LinkButton
                style={{ flexWrap: 'nowrap' }}
                to={getDetailsPageUrl(voter)}
              >
                <Font noWrap>View Details</Font>
              </LinkButton>
            </Column>
          )}
        />
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

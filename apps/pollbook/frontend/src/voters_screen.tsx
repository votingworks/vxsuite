import { MainContent, Font, H1, LinkButton } from '@votingworks/ui';
import { useState } from 'react';
import type { Voter, VoterSearchParams } from '@votingworks/pollbook-backend';
import { useHistory } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';
import { getDeviceStatuses, getElection } from './api';
import { Row } from './layout';
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
            <LinkButton
              style={{ flexWrap: 'nowrap' }}
              to={getDetailsPageUrl(voter)}
            >
              <Font noWrap>View Details</Font>
            </LinkButton>
          )}
        />
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

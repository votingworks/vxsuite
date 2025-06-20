import { MainContent, Font, H1, LinkButton } from '@votingworks/ui';
import { useState } from 'react';
import type { VoterSearchParams } from '@votingworks/pollbook-backend';
import { getDeviceStatuses } from './api';
import { Row } from './layout';
import { ElectionManagerNavScreen } from './nav_screen';
import { VoterSearch, createEmptySearchParams } from './voter_search_screen';
import { ExportVoterActivityButton } from './export_voter_activity';

export function ElectionManagerVotersScreen(): JSX.Element | null {
  const [search, setSearch] = useState<VoterSearchParams>(
    createEmptySearchParams()
  );
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();

  if (!getDeviceStatusesQuery.isSuccess) {
    return null;
  }

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
          setSearch={setSearch}
          renderAction={(voter) => (
            <LinkButton
              style={{ flexWrap: 'nowrap' }}
              to={`/voters/${voter.voterId}`}
            >
              <Font noWrap>View Details</Font>
            </LinkButton>
          )}
        />
      </MainContent>
    </ElectionManagerNavScreen>
  );
}

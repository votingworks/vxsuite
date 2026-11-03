import { throwIllegalValue } from '@votingworks/basics';
import type { ElectionStatus } from '@votingworks/design-backend';
import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  createElection,
  generateId,
  listElections,
  useDesignRoutes,
} from '@votingworks/design-ui';
import { Button, H2, LinkButton, P, Table, TD, TH } from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { LoadElectionPackageModal } from './load_election_package_modal.js';
import {
  duplicateElection,
  getDesignStatus,
  getLocalJurisdictionId,
} from './design_api.js';

function electionStatusLabel(status: ElectionStatus): string {
  switch (status) {
    case 'notStarted':
    case 'inProgress':
      return 'In Progress';
    case 'ballotsFinalized':
    case 'ballotsApproved':
      return 'Finalized';
    default: {
      throwIllegalValue(status);
    }
  }
}

export function DesignElectionsScreen(): JSX.Element | null {
  const history = useHistory();
  const routes = useDesignRoutes();
  const listElectionsQuery = listElections.useQuery();
  const jurisdictionIdQuery = getLocalJurisdictionId.useQuery();
  const createElectionMutation = createElection.useMutation();
  const designStatusQuery = getDesignStatus.useQuery();
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const duplicateElectionMutation = duplicateElection.useMutation();

  if (
    !listElectionsQuery.isSuccess ||
    !jurisdictionIdQuery.isSuccess ||
    !designStatusQuery.isSuccess
  ) {
    return null;
  }

  function onCreateElection() {
    const id = generateId();
    createElectionMutation.mutate(
      { id, jurisdictionId: jurisdictionIdQuery.data ?? '' },
      {
        onSuccess: (result) => {
          if (result.isOk()) {
            history.push(routes.election(result.ok()).electionInfo.root.path);
          }
        },
      }
    );
  }

  const elections = listElectionsQuery.data;

  return (
    <NavigationScreen title="Election Design">
      {designStatusQuery.data.status === 'ready' && (
        <P>State: {designStatusQuery.data.stateCode}</P>
      )}
      <H2>Elections</H2>
      <P>
        <Button
          icon="Add"
          variant="primary"
          onPress={onCreateElection}
          disabled={createElectionMutation.isLoading}
        >
          Create Election
        </Button>{' '}
        <Button icon="Import" onPress={() => setIsLoadModalOpen(true)}>
          Load Election Package
        </Button>
      </P>
      {isLoadModalOpen && (
        <LoadElectionPackageModal onClose={() => setIsLoadModalOpen(false)} />
      )}
      {elections.length === 0 ? (
        <P>No elections yet.</P>
      ) : (
        <Table>
          <thead>
            <tr>
              <TH>Title</TH>
              <TH>Date</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {elections.map((election) => (
              <tr key={election.electionId}>
                <TD>{election.title || 'Untitled Election'}</TD>
                <TD>
                  {election.date
                    .toMidnightDatetimeWithSystemTimezone()
                    .toLocaleDateString()}
                </TD>
                <TD>{electionStatusLabel(election.status)}</TD>
                <TD>
                  <Button
                    onPress={() =>
                      duplicateElectionMutation.mutate({
                        electionId: election.electionId,
                      })
                    }
                    disabled={duplicateElectionMutation.isLoading}
                  >
                    Duplicate
                  </Button>{' '}
                  <LinkButton
                    to={
                      routes.election(election.electionId).electionInfo.root
                        .path
                    }
                  >
                    Open
                  </LinkButton>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </NavigationScreen>
  );
}

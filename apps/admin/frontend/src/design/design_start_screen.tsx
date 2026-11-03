import { useState } from 'react';
import { Redirect, useHistory } from 'react-router-dom';
import { useDesignRoutes } from '@votingworks/design-ui';
import { Button, Callout, H2, P } from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { LoadElectionPackageModal } from './load_election_package_modal.js';
import {
  createDesign,
  getCurrentDesign,
  getDesignStatus,
} from './design_api.js';

export function DesignStartScreen(): JSX.Element | null {
  const history = useHistory();
  const routes = useDesignRoutes();
  const currentDesignQuery = getCurrentDesign.useQuery();
  const designStatusQuery = getDesignStatus.useQuery();
  const createDesignMutation = createDesign.useMutation();
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);

  if (!currentDesignQuery.isSuccess || !designStatusQuery.isSuccess) {
    return null;
  }

  const currentDesign = currentDesignQuery.data;
  if (currentDesign) {
    return (
      <Redirect
        to={routes.election(currentDesign.electionId).electionInfo.root.path}
      />
    );
  }

  return (
    <NavigationScreen title="Election Design">
      {designStatusQuery.data.status === 'ready' && (
        <P>State: {designStatusQuery.data.stateCode}</P>
      )}
      <H2>Start an Election</H2>
      <P>
        VxAdmin holds one election at a time. Create a new election or start
        from a saved election package.
      </P>
      <P>
        <Button
          icon="Add"
          variant="primary"
          onPress={() =>
            createDesignMutation.mutate(undefined, {
              onSuccess: (electionId) => {
                history.push(
                  routes.election(electionId).electionInfo.root.path
                );
              },
            })
          }
          disabled={createDesignMutation.isLoading}
        >
          Create Election
        </Button>{' '}
        <Button icon="Import" onPress={() => setIsLoadModalOpen(true)}>
          Load Election Package
        </Button>
      </P>
      {createDesignMutation.isError && (
        <Callout color="danger" icon="Danger">
          Could not create the election.
        </Callout>
      )}
      {isLoadModalOpen && (
        <LoadElectionPackageModal onClose={() => setIsLoadModalOpen(false)} />
      )}
    </NavigationScreen>
  );
}

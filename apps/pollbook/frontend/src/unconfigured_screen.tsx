import { assert, groupBy } from '@votingworks/basics';
import {
  Button,
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
  Main,
  MainContent,
  Table,
  UsbDriveImage,
} from '@votingworks/ui';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { LoggedIn } from '@votingworks/types/src/auth/dipped_smart_card_auth';
import { useState } from 'react';
import { configureFromMachine, getDeviceStatuses, getElection } from './api';
import { Header, NavScreen } from './nav_screen';

function CenteredScreen({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <NavScreen>
      <Main flexColumn>
        <MainContent
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </MainContent>
      </Main>
    </NavScreen>
  );
}
function ConfigurationScreen({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <NavScreen>
      <Header>
        <H1>Configuration</H1>
      </Header>
      <Main flexColumn>
        <MainContent>{children}</MainContent>
      </Main>
    </NavScreen>
  );
}

function PollbookConnectionTable({
  pollbooks,
  onConfigure,
}: {
  pollbooks: Array<{
    machineId: string;
    configuredElectionId?: string;
    checkIns?: number;
  }>;
  onConfigure: (machineId: string) => void;
}): JSX.Element {
  const elections = groupBy(pollbooks, (p) => p.configuredElectionId);
  return (
    <div
      style={{
        margin: '2rem 0',
      }}
    >
      <Table>
        <thead>
          <tr>
            <th>Election ID</th>
            <th>Connected Machine IDs</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {elections.map(([electionId, pollbooksForElection]) => (
            <tr key={electionId}>
              <td>{electionId}</td>
              <td>{pollbooksForElection.map((p) => p.machineId).join(', ')}</td>
              <td>
                <Button
                  color="primary"
                  onPress={() => onConfigure(pollbooks[0].machineId)}
                >
                  Configure
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export function UnconfiguredSystemAdminScreen(): JSX.Element {
  const getElectionQuery = getElection.useQuery({
    refetchInterval: 100,
  });
  const getDevicesQuery = getDeviceStatuses.useQuery();
  const configureMutation = configureFromMachine.useMutation();
  assert(getElectionQuery.isSuccess);
  const electionResult = getElectionQuery.data;
  const [isLoadingFromNetwork, setIsLoadingFromNetwork] = useState(false);

  if (electionResult.isOk() || electionResult.err() === 'loading') {
    return (
      <CenteredScreen>
        <FullScreenMessage
          title="Configuring VxPollbook from USB drive…"
          image={
            <FullScreenIconWrapper>
              <Icons.Loading />
            </FullScreenIconWrapper>
          }
        />
      </CenteredScreen>
    );
  }
  if (isLoadingFromNetwork && electionResult.err() === 'unconfigured') {
    return (
      <CenteredScreen>
        <FullScreenMessage
          title="Configuring VxPollbook from network…"
          image={
            <FullScreenIconWrapper>
              <Icons.Loading />
            </FullScreenIconWrapper>
          }
        />
      </CenteredScreen>
    );
  }
  // TODO-CARO-IMPLEMENT handle loading and error responses
  if (!getDevicesQuery.isSuccess) {
    console.log(getDevicesQuery.isLoading);
    return <CenteredScreen>HI</CenteredScreen>;
  }
  const { isOnline, pollbooks } = getDevicesQuery.data.network;

  if (electionResult.err() === 'not-found') {
    return (
      <CenteredScreen>
        <FullScreenMessage
          title="Failed to configure VxPollbook"
          image={
            <FullScreenIconWrapper>
              <Icons.Warning color="warning" />
            </FullScreenIconWrapper>
          }
        >
          No pollbook package found on the inserted USB drive.
        </FullScreenMessage>
      </CenteredScreen>
    );
  }

  function configureElectionFromMachine(machineId: string) {
    setIsLoadingFromNetwork(true);
    configureMutation.mutate(
      { machineId },
      { onSuccess: () => setIsLoadingFromNetwork(false) }
    );
  }
  const configuredPollbooks = pollbooks.filter(
    (p) => p.configuredElectionId !== undefined
  );
  if (!isOnline || configuredPollbooks.length <= 0) {
    return (
      <CenteredScreen>
        <FullScreenMessage
          title="Insert a USB drive containing a pollbook package or power up another configured machine."
          image={<UsbDriveImage />}
        />
      </CenteredScreen>
    );
  }

  return (
    <ConfigurationScreen>
      Insert a USB drive containing a pollbook package, or configure from
      another nearby machine listed below.
      <PollbookConnectionTable
        pollbooks={configuredPollbooks}
        onConfigure={configureElectionFromMachine}
      />
    </ConfigurationScreen>
  );
}

export function UnconfiguredElectionManagerScreen(): JSX.Element {
  const getElectionQuery = getElection.useQuery({
    refetchInterval: 100,
  });
  assert(getElectionQuery.isSuccess);
  const electionResult = getElectionQuery.data;

  if (electionResult.isOk() || electionResult.err() === 'loading') {
    return (
      <CenteredScreen>
        <FullScreenMessage
          title="Configuring VxPollbook from USB drive…"
          image={
            <FullScreenIconWrapper>
              <Icons.Loading />
            </FullScreenIconWrapper>
          }
        />
      </CenteredScreen>
    );
  }
  if (electionResult.err() === 'not-found') {
    return (
      <CenteredScreen>
        <FullScreenMessage
          title="Failed to configure VxPollbook"
          image={
            <FullScreenIconWrapper>
              <Icons.Warning color="warning" />
            </FullScreenIconWrapper>
          }
        >
          No pollbook package found on the inserted USB drive.
        </FullScreenMessage>
      </CenteredScreen>
    );
  }

  return (
    <CenteredScreen>
      <FullScreenMessage
        title="Insert a USB drive containing a pollbook package"
        image={<UsbDriveImage />}
      />
    </CenteredScreen>
  );
}

export function UnconfiguredScreen({ auth }: { auth: LoggedIn }): JSX.Element {
  if (isSystemAdministratorAuth(auth)) {
    return <UnconfiguredSystemAdminScreen />;
  }
  if (isElectionManagerAuth(auth)) {
    return <UnconfiguredElectionManagerScreen />;
  }
  throw new Error('Unsupported'); // TODO-CARO
}

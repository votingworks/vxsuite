import { assert, groupBy } from '@votingworks/basics';
import {
  Button,
  Card,
  FullScreenIconWrapper,
  FullScreenMessage,
  Icons,
  Loading,
  Main,
  MainContent,
  P,
  Table,
  UsbDriveImage,
} from '@votingworks/ui';
import type { PollbookServiceInfo } from '@votingworks/pollbook-backend';
import { useState } from 'react';
import { formatElectionHashes } from '@votingworks/types';
import {
  configureFromPeerMachine,
  getDeviceStatuses,
  getElection,
} from './api';
import { NavScreen } from './nav_screen';
import { PollbookConnectionStatus } from './types';

function PollbookConnectionTable({
  pollbooks,
  onConfigure,
}: {
  pollbooks: PollbookServiceInfo[];
  onConfigure: (machineId: string) => void;
}): JSX.Element {
  // Group pollbooks by election hash (ballotHash-packageHash)
  const groups = groupBy(
    pollbooks,
    (p) => `${p.electionBallotHash}-${p.pollbookPackageHash}`
  );
  return (
    <div
      style={{
        margin: '2rem 0',
      }}
    >
      <Table>
        <thead>
          <tr>
            <th>Election Name</th>
            <th>Election Hash</th>
            <th>Connected Machine IDs</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {groups.map(([electionHash, pollbooksForElection]) => (
            <tr key={electionHash} data-testid="pollbook-config-row">
              <td>{pollbooksForElection[0].electionTitle}</td>
              <td>
                {formatElectionHashes(
                  pollbooksForElection[0].electionBallotHash || '',
                  pollbooksForElection[0].pollbookPackageHash || ''
                )}
              </td>
              <td>{pollbooksForElection.map((p) => p.machineId).join(', ')}</td>
              <td>
                <Button
                  color="primary"
                  onPress={() => onConfigure(pollbooksForElection[0].machineId)}
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
  const configureMutation = configureFromPeerMachine.useMutation();
  const [isLoadingFromNetwork, setIsLoadingFromNetwork] = useState(false);
  const [configurationErrorMessage, setConfigurationErrorMessage] =
    useState('');

  if (getDevicesQuery.isLoading || !getElectionQuery.isSuccess) {
    return <Loading />;
  }
  const electionResult = getElectionQuery.data;

  if (electionResult.isOk() || electionResult.err() === 'loading') {
    return (
      <FullScreenMessage
        title="Configuring VxPollbook from USB drive…"
        image={
          <FullScreenIconWrapper>
            <Icons.Loading />
          </FullScreenIconWrapper>
        }
      />
    );
  }
  if (isLoadingFromNetwork && electionResult.err() === 'unconfigured') {
    return (
      <FullScreenMessage
        title="Configuring VxPollbook from network…"
        image={
          <FullScreenIconWrapper>
            <Icons.Loading />
          </FullScreenIconWrapper>
        }
      />
    );
  }
  const { isOnline, pollbooks } = getDevicesQuery.isError
    ? { isOnline: false, pollbooks: [] }
    : getDevicesQuery.data.network;

  const configuredPollbooks = pollbooks.filter(
    (p) => p.electionId && p.status === PollbookConnectionStatus.WrongElection
  );
  if (!isOnline || configuredPollbooks.length <= 0) {
    if (electionResult.err() === 'not-found-usb') {
      return (
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
      );
    }
    return (
      <FullScreenMessage
        title="Insert a USB drive containing a pollbook package or power up another configured machine."
        image={<UsbDriveImage />}
      />
    );
  }

  return (
    <MainContent>
      {electionResult.err() === 'not-found-usb' && (
        <Card color="warning" style={{ marginBottom: '1rem' }}>
          <Icons.Warning color="warning" /> No pollbook package found on the
          inserted USB drive.
        </Card>
      )}
      {configurationErrorMessage && (
        <Card color="warning" style={{ marginBottom: '1rem' }}>
          <Icons.Warning color="warning" /> Error during configuration, please
          try again.
        </Card>
      )}
      <P>
        Insert a USB drive containing a pollbook package, or configure from
        another nearby machine listed below.
      </P>
      <PollbookConnectionTable
        pollbooks={configuredPollbooks}
        onConfigure={(machineId) => {
          setIsLoadingFromNetwork(true);
          configureMutation.mutate(
            { machineId },
            {
              onSuccess: (result) => {
                setIsLoadingFromNetwork(false);
                if (result.isErr()) {
                  setConfigurationErrorMessage(result.err());
                }
              },
            }
          );
        }}
      />
    </MainContent>
  );
}

function Screen({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <NavScreen>
      <Main flexColumn>
        <MainContent>{children}</MainContent>
      </Main>
    </NavScreen>
  );
}

export function UnconfiguredElectionManagerScreen(): JSX.Element {
  const getElectionQuery = getElection.useQuery({
    refetchInterval: 100,
  });

  if (!getElectionQuery.isSuccess) {
    return (
      <Screen>
        <FullScreenMessage
          title="Configuring VxPollbook from network…"
          image={
            <FullScreenIconWrapper>
              <Icons.Loading />
            </FullScreenIconWrapper>
          }
        />
      </Screen>
    );
  }
  const electionResult = getElectionQuery.data;
  if (electionResult.err() === 'recently-unconfigured') {
    return (
      <Screen>
        <FullScreenMessage
          title="Machine Unconfigured"
          image={
            <FullScreenIconWrapper>
              <Icons.Loading />
            </FullScreenIconWrapper>
          }
        >
          The machine has been unconfigured and will now lock automatically…
        </FullScreenMessage>
      </Screen>
    );
  }

  if (
    electionResult.isOk() ||
    electionResult.err() === 'loading' ||
    electionResult.err() === 'unconfigured'
  ) {
    return (
      <Screen>
        <FullScreenMessage
          title="Configuring VxPollbook from network…"
          image={
            <FullScreenIconWrapper>
              <Icons.Loading />
            </FullScreenIconWrapper>
          }
        />
      </Screen>
    );
  }
  if (electionResult.err() === 'network-configuration-error') {
    return (
      <Screen>
        <FullScreenMessage
          title="Failed to configure VxPollBook"
          image={
            <FullScreenIconWrapper>
              <Icons.Warning color="warning" />
            </FullScreenIconWrapper>
          }
        >
          Error configuring machine please try again.
        </FullScreenMessage>
      </Screen>
    );
  }
  if (
    electionResult.err() === 'network-conflicting-pollbook-packages-match-card'
  ) {
    return (
      <Screen>
        <FullScreenMessage
          title="No Valid Configuration Detected"
          image={
            <FullScreenIconWrapper>
              <Icons.Warning color="warning" />
            </FullScreenIconWrapper>
          }
        >
          VxPollBook detected other poll books on the network with conflicting
          configurations. Make sure you unconfigure any outdated machines and
          try again.
        </FullScreenMessage>
      </Screen>
    );
  }

  if (
    electionResult.err() === 'not-found-configuration-matching-election-card'
  ) {
    return (
      <Screen>
        <FullScreenMessage
          title="No Valid Configuration Detected"
          image={
            <FullScreenIconWrapper>
              <Icons.Warning color="warning" />
            </FullScreenIconWrapper>
          }
        >
          VxPollBook detected other poll books, but none of them are configured
          with a poll book package matching the current election manager card.
        </FullScreenMessage>
      </Screen>
    );
  }
  assert(electionResult.err() === 'not-found-network');
  return (
    <Screen>
      <FullScreenMessage
        title="No Configuration Detected"
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        VxPollBook did not detect any other configured poll books on the
        network.
      </FullScreenMessage>
    </Screen>
  );
}

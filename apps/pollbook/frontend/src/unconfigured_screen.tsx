import { assert } from '@votingworks/basics';
import {
  Button,
  FullScreenIconWrapper,
  FullScreenMessage,
  Icons,
  Main,
  MainContent,
  UsbDriveImage,
} from '@votingworks/ui';
import { configureFromMachine, getDeviceStatuses, getElection } from './api';
import { NavScreen } from './nav_screen';

function Screen({ children }: { children: React.ReactNode }): JSX.Element {
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

export function UnconfiguredScreen(): JSX.Element {
  const getElectionQuery = getElection.useQuery({
    refetchInterval: 100,
  });
  const getDevicesQuery = getDeviceStatuses.useQuery();
  const configureMutation = configureFromMachine.useMutation();
  assert(getElectionQuery.isSuccess);
  const electionResult = getElectionQuery.data;

  if (electionResult.isOk() || electionResult.err() === 'loading') {
    return (
      <Screen>
        <FullScreenMessage
          title="Configuring VxPollbook from USB drive…"
          image={
            <FullScreenIconWrapper>
              <Icons.Loading />
            </FullScreenIconWrapper>
          }
        />
      </Screen>
    );
  }
  // TODO-CARO-IMPLEMENT handle loading and error responses
  if (!getDevicesQuery.isSuccess) {
    console.log(getDevicesQuery.isLoading);
    return <Screen>HI</Screen>;
  }
  const { isOnline, pollbooks } = getDevicesQuery.data.network;

  if (electionResult.err() === 'not-found') {
    return (
      <Screen>
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
      </Screen>
    );
  }

  function configureElectionFromMachine(machineId: string) {
    configureMutation.mutate({ machineId });
  }

  return (
    <Screen>
      {isOnline && (
        <div>
          {pollbooks.map((pb) => (
            <div key={pb.machineId}>
              Machine Id: {pb.machineId}{' '}
              <Button
                onPress={() => configureElectionFromMachine(pb.machineId)}
              >
                {' '}
                Configure
              </Button>
            </div>
          ))}
        </div>
      )}
      <FullScreenMessage
        title="Insert a USB drive containing a pollbook package"
        image={<UsbDriveImage />}
      />
    </Screen>
  );
}

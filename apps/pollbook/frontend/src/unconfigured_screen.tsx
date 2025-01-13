import { assert } from '@votingworks/basics';
import {
  Button,
  FullScreenIconWrapper,
  FullScreenMessage,
  Icons,
  Main,
  MainContent,
  MainHeader,
  UsbDriveImage,
} from '@votingworks/ui';
import { getElection, logOut } from './api';
import { NavScreen } from './nav_screen';
import { Row } from './layout';

function Screen({ children }: { children: React.ReactNode }): JSX.Element {
  const logOutMutation = logOut.useMutation();
  return (
    <NavScreen>
      <Main flexColumn>
        <MainHeader>
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button icon="Lock" onPress={() => logOutMutation.mutate()}>
              Lock Machine
            </Button>
          </Row>
        </MainHeader>
        <MainContent style={{ display: 'flex', alignItems: 'center' }}>
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

  return (
    <Screen>
      <FullScreenMessage
        title="Insert a USB drive containing a pollbook package"
        image={<UsbDriveImage />}
      />
    </Screen>
  );
}

import { assert } from '@votingworks/basics';
import {
  FullScreenIconWrapper,
  FullScreenMessage,
  Icons,
  Main,
  MainContent,
  UsbDriveImage,
} from '@votingworks/ui';
import { getElection } from './api';
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

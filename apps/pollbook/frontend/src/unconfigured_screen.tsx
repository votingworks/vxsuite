import { assert } from '@votingworks/basics';
import {
  FullScreenIconWrapper,
  FullScreenMessage,
  Icons,
  Loading,
  Main,
  Screen,
  UsbDriveImage,
} from '@votingworks/ui';
import { getElectionConfiguration } from './api';

export function UnconfiguredScreen(): JSX.Element {
  const getElectionConfigurationQuery = getElectionConfiguration.useQuery({
    refetchInterval: 100,
  });
  assert(getElectionConfigurationQuery.isSuccess);
  const configurationResult = getElectionConfigurationQuery.data;

  if (configurationResult.isOk() || configurationResult.err() === 'loading') {
    return (
      <Screen>
        <Main centerChild>
          <FullScreenMessage
            title="Configuring VxPollbook from USB drive…"
            image={<Loading />}
          />
        </Main>
      </Screen>
    );
  }

  if (configurationResult.err() === 'not-found') {
    return (
      <Screen>
        <Main centerChild>
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
        </Main>
      </Screen>
    );
  }

  return (
    <Screen>
      <Main centerChild>
        <FullScreenMessage
          title="Insert a USB drive containing a pollbook package"
          image={<UsbDriveImage />}
        />
      </Main>
    </Screen>
  );
}

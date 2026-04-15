import { H1, P } from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName as Feature,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export function UnconfiguredPollingPlaceScreen(): JSX.Element {
  if (!isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES)) {
    return (
      <ScreenMainCenterChild
        voterFacing={false}
        showTestModeBanner={false}
        showEarlyVotingBanner={false}
      >
        <CenteredText>
          <H1>No Precinct Selected</H1>
          <P>Insert an election manager card to select a precinct.</P>
        </CenteredText>
      </ScreenMainCenterChild>
    );
  }

  return (
    <ScreenMainCenterChild
      voterFacing={false}
      showTestModeBanner={false}
      showEarlyVotingBanner={false}
    >
      <CenteredText>
        <H1>No Polling Place Selected</H1>
        <P>Insert an election manager card to select a polling place.</P>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredPollingPlaceScreen />;
}

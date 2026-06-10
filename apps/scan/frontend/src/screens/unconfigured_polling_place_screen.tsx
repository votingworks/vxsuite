import { H1, P } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export function UnconfiguredPollingPlaceScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing={false} showTestModeBanner={false}>
      <CenteredText>
        <H1>No Polling Place Selected</H1>
        <P>Insert an election manager card to select a polling place.</P>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredPollingPlaceScreen />;
}

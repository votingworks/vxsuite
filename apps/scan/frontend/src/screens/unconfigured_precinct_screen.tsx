import { H1, P } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export function UnconfiguredPrecinctScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing={false}>
      <CenteredText>
        <H1>No Precinct Selected</H1>
        <P>Insert an election manager card to select a precinct.</P>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredPrecinctScreen />;
}

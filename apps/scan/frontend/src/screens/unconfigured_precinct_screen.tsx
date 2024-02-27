import { CenteredLargeProse, H1, P } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function UnconfiguredPrecinctScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing={false}>
      <CenteredLargeProse>
        <H1>No Precinct Selected</H1>
        <P>Insert an Election Manager card to select a precinct.</P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredPrecinctScreen />;
}

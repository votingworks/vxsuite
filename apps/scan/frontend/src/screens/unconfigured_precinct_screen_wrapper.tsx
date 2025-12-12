import { UnconfiguredPrecinctScreen } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function UnconfiguredPrecinctScreenWrapper(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing={false} showTestModeBanner={false}>
      <UnconfiguredPrecinctScreen />
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredPrecinctScreenWrapper />;
}

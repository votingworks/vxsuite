import { H1, LoadingAnimation } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export function LoadingConfigurationScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing={false} showModeBanner={false}>
      <LoadingAnimation />
      <CenteredText>
        <H1>Loading Configuration…</H1>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <LoadingConfigurationScreen />;
}

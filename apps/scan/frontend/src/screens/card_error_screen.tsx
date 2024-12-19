import { H1, P, RotateCardImage } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export function CardErrorScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing={false}>
      <RotateCardImage />
      <CenteredText>
        <H1>Card Backward</H1>
        <P>Remove the card, turn it around, and insert it again.</P>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <CardErrorScreen />;
}

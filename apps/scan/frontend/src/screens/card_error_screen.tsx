import { CenteredLargeProse, H1, P, RotateCardImage } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function CardErrorScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing={false}>
      <RotateCardImage />
      <CenteredLargeProse>
        <H1>Card is Backwards</H1>
        <P>Remove the card, turn it around, and insert it again.</P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <CardErrorScreen />;
}

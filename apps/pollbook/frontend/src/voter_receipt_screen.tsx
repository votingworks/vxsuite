import {
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
  LoadingAnimation,
  PrintingBallotImage,
} from '@votingworks/ui';
import { NoNavScreen } from './nav_screen';

export function VoterReceiptScreen() {
  return (
    <NoNavScreen>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <LoadingAnimation />
        <H1>Printing voter receipt…</H1>
      </div>
    </NoNavScreen>
  );
}

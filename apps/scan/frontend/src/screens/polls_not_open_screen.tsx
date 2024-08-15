import { FullScreenIconWrapper, Icons, P } from '@votingworks/ui';
import { PollsState } from '@votingworks/types';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

export interface PollsNotOpenScreenProps {
  isLiveMode: boolean;
  pollsState: Omit<PollsState, 'polls_open'>;
  scannedBallotCount: number;
}

export function PollsNotOpenScreen({
  isLiveMode,
  pollsState,
  scannedBallotCount,
}: PollsNotOpenScreenProps): JSX.Element {
  return (
    <Screen
      centerContent
      isLiveMode={isLiveMode}
      infoBarMode="pollworker"
      ballotCountOverride={scannedBallotCount}
      voterFacing={false}
    >
      <FullScreenPromptLayout
        title={pollsState === 'polls_paused' ? 'Polls Paused' : 'Polls Closed'}
        image={
          <FullScreenIconWrapper>
            {pollsState === 'polls_paused' ? (
              <Icons.Paused />
            ) : (
              <Icons.Closed />
            )}
          </FullScreenIconWrapper>
        }
      >
        {pollsState === 'polls_closed_final' ? (
          <P>Voting is complete.</P>
        ) : (
          <P>Insert a poll worker card to open polls.</P>
        )}
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_initial"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function DefaultTestModePreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode={false}
      pollsState="polls_closed_initial"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_initial"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function PollsPausedPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_paused"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function PollsClosedFinalPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_final"
      scannedBallotCount={42}
    />
  );
}

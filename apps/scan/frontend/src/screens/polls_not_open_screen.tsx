import { FullScreenIconWrapper, Icons, P } from '@votingworks/ui';
import { PollsState } from '@votingworks/types';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

export interface PollsNotOpenScreenProps {
  isTestMode: boolean;
  pollsState: Omit<PollsState, 'polls_open'>;
  scannedBallotCount: number;
}

export function PollsNotOpenScreen({
  isTestMode,
  pollsState,
  scannedBallotCount,
}: PollsNotOpenScreenProps): JSX.Element {
  return (
    <Screen
      centerContent
      showTestModeBanner={isTestMode}
      infoBarMode="pollworker"
      ballotCountOverride={scannedBallotCount}
      voterFacing={false}
    >
      <FullScreenPromptLayout
        title={pollsState === 'polls_paused' ? 'Voting Paused' : 'Polls Closed'}
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
        ) : pollsState === 'polls_paused' ? (
          <P>Insert a poll worker card to resume voting.</P>
        ) : (
          <P>Insert a poll worker card to open polls.</P>
        )}
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isTestMode={false}
      pollsState="polls_closed_initial"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next - @preserve */
export function DefaultTestModePreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isTestMode
      pollsState="polls_closed_initial"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next - @preserve */
export function NoPowerConnectedPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isTestMode={false}
      pollsState="polls_closed_initial"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next - @preserve */
export function PollsPausedPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isTestMode={false}
      pollsState="polls_paused"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next - @preserve */
export function PollsClosedFinalPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isTestMode={false}
      pollsState="polls_closed_final"
      scannedBallotCount={42}
    />
  );
}

import { Caption, FullScreenIconWrapper, Icons, P } from '@votingworks/ui';
import { PollsState } from '@votingworks/types';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

export interface PollsNotOpenScreenProps {
  isLiveMode: boolean;
  pollsState: Omit<PollsState, 'polls_open'>;
  showNoChargerWarning: boolean;
  scannedBallotCount: number;
}

export function PollsNotOpenScreen({
  isLiveMode,
  pollsState,
  showNoChargerWarning,
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
        {showNoChargerWarning && (
          <Caption>
            <Icons.Warning color="warning" />{' '}
            <strong>No Power Detected.</strong> Please ask a poll worker to plug
            in the power cord.
          </Caption>
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
      showNoChargerWarning={false}
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
      showNoChargerWarning={false}
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
      showNoChargerWarning
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
      showNoChargerWarning={false}
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
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

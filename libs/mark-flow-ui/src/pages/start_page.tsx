/* istanbul ignore file - tested via Mark/Mark-Scan */
import styled, { keyframes } from 'styled-components';
import {
  Button,
  appStrings,
  AudioOnly,
  ReadOnLoad,
  PageNavigationButtonId,
  Caption,
  electionStrings,
  H1,
  NumberString,
  P,
  ReadOnIdle,
  Seal,
} from '@votingworks/ui';

import { assert, assertDefined, find } from '@votingworks/basics';

import {
  BallotStyleId,
  ElectionDefinition,
  getBallotStyle,
  getPartyForBallotStyle,
  PrecinctId,
} from '@votingworks/types';
import { getPrecinctsAndSplitsForBallotStyle } from '@votingworks/utils';
import { getVotableContestCount } from '../utils/votable_contest_count';
import { VoterHelpScreenType, VoterScreen } from '../components/voter_screen';

const wobbleKeyframes = keyframes`
  0%, 93% { transform: rotate(0deg); }
  94% { transform: rotate(-5deg); }
  95% { transform: rotate(10deg); }
  96% { transform: rotate(-3deg); }
  97% { transform: rotate(6deg); }
  98% { transform: rotate(-1deg); }
  99% { transform: rotate(2deg); }
`;

const ElectionInfo = styled.div`
  display: flex;
  gap: 0.5rem;

  @media (orientation: portrait) {
    flex-direction: column;
  }
`;

const StartVotingButton = styled(Button)`
  font-size: 1.2rem;
  line-height: 2rem;
  animation: ${wobbleKeyframes} 10s linear infinite;
`;

const REPEAT_INTRO_AUDIO_PROMPT_DELAY_MS = 15_000;

export interface StartPageProps {
  introAudioText: React.ReactNode;
  /**
   * Optional audio-only prompt, read whenever screen reader audio has been
   * idle for {@link REPEAT_INTRO_AUDIO_PROMPT_DELAY_MS}, reminding the voter
   * how to replay the intro instructions or start voting. When provided, the
   * left arrow button on the accessible controller replays the intro audio.
   */
  repeatIntroAudioPrompt?: React.ReactNode;
  ballotStyleId?: BallotStyleId;
  electionDefinition?: ElectionDefinition;
  onStart: () => void;
  precinctId?: PrecinctId;
  VoterHelpScreen?: VoterHelpScreenType;
}

export function StartPage(props: StartPageProps): JSX.Element {
  const {
    ballotStyleId,
    electionDefinition,
    introAudioText,
    repeatIntroAudioPrompt,
    precinctId,
    onStart,
    VoterHelpScreen,
  } = props;

  assert(
    electionDefinition,
    'electionDefinition is required to render StartPage'
  );
  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render StartPage'
  );
  assert(
    typeof ballotStyleId !== 'undefined',
    'ballotStyleId is required to render StartPage'
  );

  const { election } = electionDefinition;
  const { county, seal } = election;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const precinctOrSplit = find(
    getPrecinctsAndSplitsForBallotStyle({ election, ballotStyle }),
    ({ precinct }) => precinct.id === precinctId
  );
  const precinctOrSplitName = precinctOrSplit.split
    ? electionStrings.precinctSplitName(precinctOrSplit.split)
    : electionStrings.precinctName(precinctOrSplit.precinct);

  const party = getPartyForBallotStyle({ ballotStyleId, election });

  const votableContestCount = getVotableContestCount({ election, ballotStyle });

  const electionInfo = (
    <ElectionInfo>
      <Seal
        seal={seal}
        maxWidth="7rem"
        style={{
          marginBottom: '0.5rem',
        }}
      />
      <div>
        {party && <H1>{electionStrings.partyFullName(party)}</H1>}
        <H1>{electionStrings.electionTitle(election)}</H1>
        <P>{electionStrings.electionDate(election)}</P>
        <P>
          <Caption maxLines={4}>
            {/* TODO(kofi): Use more language-agnostic delimiter (e.g. '|') or find way to translate commas. */}
            {electionStrings.countyName(county)},{' '}
            {electionStrings.stateName(election)}
          </Caption>
          <Caption>{precinctOrSplitName}</Caption>
          <br />
          <Caption>
            {appStrings.labelNumBallotContests()}{' '}
            <NumberString value={votableContestCount} />
          </Caption>
        </P>
      </div>
    </ElectionInfo>
  );

  const startVotingButton = (
    <StartVotingButton
      variant="primary"
      onPress={onStart}
      id={PageNavigationButtonId.NEXT}
      rightIcon="Next"
    >
      {appStrings.buttonStartVoting()}
    </StartVotingButton>
  );

  return (
    <VoterScreen padded VoterHelpScreen={VoterHelpScreen}>
      <div style={{ margin: 'auto', padding: '0.5rem' }}>
        <ReadOnLoad
          id={
            repeatIntroAudioPrompt ? PageNavigationButtonId.PREVIOUS : undefined
          }
        >
          {electionInfo}
          <AudioOnly>{introAudioText}</AudioOnly>
        </ReadOnLoad>
        {repeatIntroAudioPrompt && (
          <ReadOnIdle delayMs={REPEAT_INTRO_AUDIO_PROMPT_DELAY_MS}>
            {repeatIntroAudioPrompt}
          </ReadOnIdle>
        )}
        {startVotingButton}
      </div>
    </VoterScreen>
  );
}

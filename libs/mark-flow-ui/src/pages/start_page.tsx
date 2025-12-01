/* istanbul ignore file - @preserve - tested via Mark/Mark-Scan */
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
  Seal,
  useScreenInfo,
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
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
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

export interface StartPageProps {
  introAudioText: React.ReactNode;
  ballotStyleId?: BallotStyleId;
  contests: ContestsWithMsEitherNeither;
  electionDefinition?: ElectionDefinition;
  onStart: () => void;
  precinctId?: PrecinctId;
  VoterHelpScreen?: VoterHelpScreenType;
}

export function StartPage(props: StartPageProps): JSX.Element {
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    introAudioText,
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
  const screenInfo = useScreenInfo();
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

  const electionInfo = (
    <ElectionInfo>
      <Seal
        seal={seal}
        maxWidth="7rem"
        style={{
          marginRight: screenInfo.isPortrait ? undefined : '1rem', // for horizontal layout
          marginBottom: screenInfo.isPortrait ? '0.5rem' : undefined, // for vertical layout
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
            <NumberString value={contests.length} />
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
        <ReadOnLoad>
          {electionInfo}
          <AudioOnly>{introAudioText}</AudioOnly>
        </ReadOnLoad>
        {startVotingButton}
      </div>
    </VoterScreen>
  );
}

import React from 'react';
import styled from 'styled-components';

import {
  Button,
  H1,
  Icons,
  InsertBallotImage,
  P,
  ReadOnLoad,
  VerifyBallotImage,
  appStrings,
} from '@votingworks/ui';
import { VoterHelpScreenType, VoterScreen } from '../components/voter_screen';

const Instructions = styled.ol`
  display: flex;
  flex-direction: column;
  margin: 2rem 0;
  padding: 0;

  @media (orientation: landscape) {
    flex-direction: row;
    justify-content: space-around;
    gap: 1rem;
    margin: 0.5rem;
  }
`;

const ListItem = styled.li`
  align-items: center;
  display: flex;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  gap: 1rem;
  margin-bottom: 1.5rem;

  @media (orientation: landscape) {
    flex-direction: column;
    margin-bottom: 0.5rem;
  }
`;

const InstructionImageContainer = styled.div`
  border-right: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  justify-content: center;
  padding: 1rem 1rem 0 0;
  width: 30vw;

  @media (orientation: landscape) {
    border: none;
    width: 30vh;
  }
`;

interface Props {
  hidePostVotingInstructions: () => void;
  printingCompleted?: boolean;
  VoterHelpScreen?: VoterHelpScreenType;
}

export function CastBallotPage({
  hidePostVotingInstructions,
  printingCompleted,
  VoterHelpScreen,
}: Props): JSX.Element {
  const instructionsRef = React.useRef<HTMLDivElement>(null);

  // Replay instructions when left arrow is pressed (no previous page on this screen)
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' && instructionsRef.current) {
        instructionsRef.current.focus();
        instructionsRef.current.click();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <VoterScreen
      actionButtons={
        <Button
          onPress={hidePostVotingInstructions}
          variant="primary"
          icon="Done"
        >
          {appStrings.buttonDone()}
        </Button>
      }
      padded
      VoterHelpScreen={VoterHelpScreen}
    >
      <div ref={instructionsRef} tabIndex={-1}>
        <ReadOnLoad>
          <H1>{appStrings.titleBmdCastBallotScreen()}</H1>
          <P>
            {printingCompleted
              ? appStrings.instructionsBmdCastBallotPreamblePostPrint()
              : appStrings.instructionsBmdCastBallotPreamble()}
          </P>
          <Instructions>
            <ListItem>
              <InstructionImageContainer>
                <VerifyBallotImage />
              </InstructionImageContainer>
              <span>{appStrings.instructionsBmdCastBallotStep1()}</span>
            </ListItem>
            <ListItem>
              <InstructionImageContainer>
                <InsertBallotImage disableAnimation />
              </InstructionImageContainer>
              <span>{appStrings.instructionsBmdCastBallotStep2()}</span>
            </ListItem>
          </Instructions>
          <P>
            <Icons.Info /> {appStrings.noteAskPollWorkerForHelp()}
          </P>
        </ReadOnLoad>
      </div>
    </VoterScreen>
  );
}

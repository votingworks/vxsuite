import styled from 'styled-components';

import {
  Button,
  H1,
  Icons,
  InsertBallotImage,
  Main,
  P,
  ReadOnLoad,
  Screen,
  VerifyBallotImage,
  appStrings,
} from '@votingworks/ui';

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

const Done = styled.div`
  position: absolute;
  right: 1rem;
  bottom: 1rem;
`;

interface Props {
  hidePostVotingInstructions: () => void;
}

export function CastBallotPage({
  hidePostVotingInstructions,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main padded>
        <ReadOnLoad>
          <H1>{appStrings.titleBmdCastBallotScreen()}</H1>
          <P>{appStrings.instructionsBmdCastBallotPreamble()}</P>
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
        <Done>
          <Button
            onPress={hidePostVotingInstructions}
            variant="primary"
            icon="Done"
          >
            {appStrings.buttonDone()}
          </Button>
        </Done>
      </Main>
    </Screen>
  );
}

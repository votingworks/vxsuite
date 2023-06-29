/* stylelint-disable order/properties-order */
import styled from 'styled-components';

import {
  Button,
  Font,
  H1,
  Icons,
  InsertBallotImage,
  Main,
  P,
  Screen,
  VerifyBallotImage,
} from '@votingworks/ui';

const Instructions = styled.ol`
  margin: 2rem 0;
  padding: 0;
`;

const ListItem = styled.li`
  align-items: center;
  display: flex;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const InstructionImageContainer = styled.div`
  border-right: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.foreground};
  display: flex;
  justify-content: center;
  padding: 1rem 1rem 0 0;
  width: 30vw;
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
    <Screen white>
      <Main padded>
        <div id="audiofocus">
          <H1 aria-label="You’re almost done.">You’re Almost Done</H1>
          <P>Your official ballot is printing. To finish voting you need to…</P>
          <Instructions>
            <ListItem>
              <InstructionImageContainer>
                <VerifyBallotImage />
              </InstructionImageContainer>
              <span>1. Verify your official ballot.</span>
            </ListItem>
            <ListItem>
              <InstructionImageContainer>
                <InsertBallotImage disableAnimation />
              </InstructionImageContainer>
              <span>2. Scan your official ballot.</span>
            </ListItem>
          </Instructions>
          <P>
            <Icons.Info /> <Font weight="bold">Need help?</Font> Ask a poll
            worker.
          </P>
        </div>
        <Done>
          <Button onPress={hidePostVotingInstructions} variant="done">
            Done
          </Button>
        </Done>
      </Main>
    </Screen>
  );
}

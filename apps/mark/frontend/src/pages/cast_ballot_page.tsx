import React from 'react';
import styled from 'styled-components';

import {
  Button,
  Main,
  Screen,
  Prose,
  Text,
  Section,
  H1,
  P,
  H3,
} from '@votingworks/ui';

const SingleGraphic = styled.img`
  margin: 0 auto 1em;
  height: 20vw;
`;

const Instructions = styled.ol`
  display: flex;
  padding: 1rem;
  list-style: none;
  text-align: center;
  > li {
    flex: 1;
    margin-right: 3em;
    &:last-child {
      margin-right: 0;
    }
    img {
      position: relative;
    }
  }
`;

const Done = styled.div`
  position: absolute;
  right: 1em;
  bottom: 1em;
`;

interface Props {
  hidePostVotingInstructions: () => void;
}

export function CastBallotPage({
  hidePostVotingInstructions,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <H1>You’re Almost Done</H1>
        <P>Your official ballot is printing. To finish voting you need to…</P>
        <Instructions>
          <li>
            <SingleGraphic
              aria-hidden
              alt="Verify Your Printed Ballot"
              src="/images/instructions-1-verify.svg"
              style={{ left: '-0.75em' }}
            />
            <Text>1. Verify your official ballot.</Text>
          </li>
          <li>
            <SingleGraphic
              aria-hidden
              alt="Scan Your Ballot"
              src="/images/instructions-2-scan.svg"
            />
            <Text>2. Scan your official ballot.</Text>
          </li>
        </Instructions>
        <H3 as="h2">Need help? Ask a poll worker.</H3>
        <Done>
          <Button variant="done" onPress={hidePostVotingInstructions}>
            Done
          </Button>
        </Done>
      </Main>
    </Screen>
  );
}

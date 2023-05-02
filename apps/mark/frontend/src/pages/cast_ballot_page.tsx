import React from 'react';
import styled from 'styled-components';

import { Button, Main, Screen, Prose, H1, H3, P, Font } from '@votingworks/ui';

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
    <Screen white>
      <Main centerChild>
        <Prose textCenter maxWidth={false} id="audiofocus">
          <H1 aria-label="You’re almost done.">You’re Almost Done</H1>
          <P>Your official ballot is printing. To finish voting you need to…</P>
          <Instructions>
            <li>
              <SingleGraphic
                aria-hidden
                alt="Verify Your Printed Ballot"
                src="/images/instructions-1-verify.svg"
                style={{ left: '-0.75em' }}
              />
              <P>1. Verify your official ballot.</P>
            </li>
            <li>
              <SingleGraphic
                aria-hidden
                alt="Scan Your Ballot"
                src="/images/instructions-2-scan.svg"
              />
              <P>2. Scan your official ballot.</P>
            </li>
          </Instructions>
          <H3>
            <Font weight="bold">Need help?</Font> Ask a poll worker.
          </H3>
        </Prose>
        <Done>
          <Button onPress={hidePostVotingInstructions}>Done</Button>
        </Done>
      </Main>
    </Screen>
  );
}

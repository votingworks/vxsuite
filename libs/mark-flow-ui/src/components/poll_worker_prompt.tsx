import { ReactNode } from 'react';
import styled from 'styled-components';
import { Caption, H6, Icons, P } from '@votingworks/ui';

const Container = styled.div`
  margin-top: 1.25em;
`;

export function PollWorkerPrompt({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    // Even when an RTL language is in use, render this element LTR since it's always rendered in
    // English.
    <Container dir="ltr">
      <H6 as="h2">
        <Icons.Info /> Poll Workers:
      </H6>
      <P>
        <Caption>{children}</Caption>
      </P>
    </Container>
  );
}

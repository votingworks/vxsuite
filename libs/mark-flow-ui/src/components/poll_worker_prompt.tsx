import React, { ReactNode } from 'react';

import { Caption, H6, Icons, P } from '@votingworks/ui';

export function PollWorkerPrompt({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <React.Fragment>
      <H6 as="h2">
        <Icons.Info /> Poll Workers:
      </H6>
      <P>
        <Caption>{children}</Caption>
      </P>
    </React.Fragment>
  );
}

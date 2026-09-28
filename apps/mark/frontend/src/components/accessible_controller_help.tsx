import React from 'react';
import {
  H1,
  Main,
  P,
  ReadOnLoad,
  Screen,
  appStrings,
  useAccessibleControllerHelpTrigger,
} from '@votingworks/ui';

export interface AccessibleControllerHelpProps {
  children: React.ReactNode;
}

export function AccessibleControllerHelp({
  children,
}: AccessibleControllerHelpProps): JSX.Element {
  const { shouldShowControllerSandbox } = useAccessibleControllerHelpTrigger();

  if (shouldShowControllerSandbox) {
    return (
      <Screen>
        <Main centerChild padded>
          <H1>Controller Help</H1>
          <ReadOnLoad>
            <P>{appStrings.helpBmdControllerButtonToggleHelp()}</P>
          </ReadOnLoad>
        </Main>
      </Screen>
    );
  }

  return <React.Fragment>{children}</React.Fragment>;
}

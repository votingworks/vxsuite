import React from 'react';
import {
  MarkControllerSandbox,
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
    return <MarkControllerSandbox />;
  }

  return <React.Fragment>{children}</React.Fragment>;
}

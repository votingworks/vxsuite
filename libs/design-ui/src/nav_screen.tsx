import type React from 'react';
import type { ElectionId } from '@votingworks/types';
import { useDesignShell } from './design_shell.js';

export function ElectionNavScreen(props: {
  electionId: ElectionId;
  children: React.ReactNode;
}): JSX.Element | null {
  const { ElectionNavScreen: ShellElectionNavScreen } = useDesignShell();
  return <ShellElectionNavScreen {...props} />;
}

export function Header(props: {
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  const { Header: ShellHeader } = useDesignShell();
  return <ShellHeader {...props} />;
}

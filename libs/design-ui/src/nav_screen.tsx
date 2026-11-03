import type React from 'react';
import type { ElectionId } from '@votingworks/types';
import { useDesignContext } from './design_context.js';

export function ElectionNavScreen(props: {
  electionId: ElectionId;
  children: React.ReactNode;
}): JSX.Element | null {
  const { ElectionNavScreen: ShellElectionNavScreen } = useDesignContext();
  return <ShellElectionNavScreen {...props} />;
}

export function Header(props: {
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  const { Header: ShellHeader } = useDesignContext();
  return <ShellHeader {...props} />;
}

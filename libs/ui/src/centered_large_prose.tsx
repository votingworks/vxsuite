import React from 'react';
import { Prose } from './prose';
import { fontSizeTheme } from './themes';

interface CenteredLargeProseProps {
  children: React.ReactNode;
}

export function CenteredLargeProse({
  children,
}: CenteredLargeProseProps): JSX.Element {
  return (
    <Prose textCenter maxWidth={false} themeDeprecated={fontSizeTheme.large}>
      {children}
    </Prose>
  );
}

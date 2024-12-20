import React from 'react';
import styled from 'styled-components';
import { ColorMode, SizeMode } from '@votingworks/types';

import { ThemePreview } from './theme_preview';
import { Font } from '../typography';

/** Props for {@link ThemeLabel}. */
export interface ThemeLabelProps {
  children: React.ReactNode;
  colorMode?: ColorMode;
  sizeMode?: SizeMode;
}

const Container = styled.span`
  align-items: center;
  display: flex;
  gap: 0.25rem;
`;

const LabelText = styled(Font)`
  display: block;
  flex-grow: 1;
`;

/**
 * Renders the given label text alongside a small preview window for the given
 * theme parameters, which default to the currently active theme parameters, if
 * unspecified.
 */
export function ThemeLabel(props: ThemeLabelProps): JSX.Element {
  const { children, colorMode, sizeMode } = props;

  return (
    <Container>
      <ThemePreview colorMode={colorMode} sizeMode={sizeMode} />
      <LabelText weight="semiBold">{children}</LabelText>
    </Container>
  );
}

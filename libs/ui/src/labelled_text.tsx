import React from 'react';
import styled from 'styled-components';
import { Caption } from './typography';

/** Props for {@link LabelledText}. */
export interface LabelledTextProps {
  children: React.ReactNode;
  label: React.ReactNode;
  /** @default 'top' */
  labelPosition?: 'bottom' | 'top';
}

const StyledContainer = styled.span`
  display: inline-block;
`;

const StyledLabel = styled(Caption)`
  display: block;
  font-size: 0.75em;
`;

const StyledValue = styled.span`
  display: block;
  font-size: 1em;
`;

/**
 * Convenience component for rendering a label/value pair of text with less
 * spacing between them than regular lines of paragraph text.
 */
export function LabelledText(props: LabelledTextProps): JSX.Element {
  const { children, label, labelPosition = 'top' } = props;

  const labelElement = label && <StyledLabel>{label}</StyledLabel>;

  return (
    <StyledContainer>
      {labelPosition === 'top' && labelElement}
      <StyledValue>{children}</StyledValue>
      {labelPosition === 'bottom' && labelElement}
    </StyledContainer>
  );
}

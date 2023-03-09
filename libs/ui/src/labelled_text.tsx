import React from "react";
import styled from "styled-components";
import { Caption } from "./typography";

export type LabelledTextProps = {
  label?: React.ReactNode;
  /** @default 'top' */
  labelPosition?: 'bottom' | 'top';
  children: React.ReactNode;
}

type StyleProps = Pick<LabelledTextProps, 'labelPosition'>;

const StyledContainer = styled.span<StyleProps>`
  display: inline-block;
`;

const StyledLabel = styled(Caption)<StyleProps>`
  display: block;
  font-weight: ${p => p.theme.sizes.fontWeight.regular};
`;

const StyledValue = styled.span<StyleProps>`
  display: block;
  font-size: 1em;
`;

export function LabelledText(props: LabelledTextProps): JSX.Element {
  const {children, label, labelPosition = 'top'} = props;

  const labelElement = label && <StyledLabel>{label}</StyledLabel>;

  return (
    <StyledContainer>
      {labelPosition === 'top' && labelElement}
      <StyledValue>{children}</StyledValue>
      {labelPosition === 'bottom' && labelElement}
    </StyledContainer>
  );
}

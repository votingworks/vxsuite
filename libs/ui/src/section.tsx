/* stylelint-disable order/properties-order, value-keyword-case, order/order */
import React from 'react';

import styled from 'styled-components';

export type SectionHorizontalAlign = 'left' | 'center' | 'right';
export type SectionVerticalAlign = 'top' | 'center' | 'bottom';

export type SectionProps = StyledDivProps & {
  children?: React.ReactNode;
};

interface StyledDivProps {
  flex?: boolean;
  horizontalAlign?: SectionHorizontalAlign;
  inline?: boolean;
  nowrap?: boolean;
  padded?: boolean;
  verticalAlign?: SectionVerticalAlign;
}

const StyledDiv = styled.div<StyledDivProps>`
  display: ${(p) =>
    p.flex
      ? p.inline
        ? 'inline-flex'
        : 'flex'
      : p.inline
      ? 'inline-block'
      : 'block'};
  flex-wrap: ${(p) => (p.nowrap ? 'nowrap' : 'wrap')};
  gap: 0.5rem;
  justify-content: ${(p) => p.horizontalAlign || 'left'};
  margin-bottom: 0.5rem;
  padding: ${(p) => (p.padded ? '0.5rem' : 'none')};
  text-align: ${(p) => p.horizontalAlign || 'left'};
`;

export function Section(props: SectionProps): JSX.Element {
  const { children, ...rest } = props;

  return <StyledDiv {...rest}>{children}</StyledDiv>;
}

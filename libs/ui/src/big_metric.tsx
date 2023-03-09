import React from "react";
import { FontProps, H1 } from "./typography";

import { format } from '@votingworks/utils';
import { LabelledText, LabelledTextProps } from "./labelled_text";
import styled from "styled-components";

export interface BigMetricProps {
  /** @default 'left' */
  align?: FontProps['align'];
  label?: React.ReactNode;
  /** @default 'top' */
  labelPosition?: LabelledTextProps['labelPosition']
  value: number;
}

const StyledContainer = styled(H1)`
  display: inline-block;
  margin-bottom: 0.35rem;
`;

/**
 * Displays a formatted, H1-sized numerical metric value with an optional label.
 */
export function BigMetric(props: BigMetricProps): JSX.Element {
  const {align, label, labelPosition, value} = props;

  return (
    <StyledContainer align={align}>
      <LabelledText label={label} labelPosition={labelPosition}>
        {format.count(value)}
      </LabelledText>
    </StyledContainer>
  );
}

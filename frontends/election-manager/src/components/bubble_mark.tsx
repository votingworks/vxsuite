import { BallotTargetMarkPosition } from '@votingworks/types';
import React from 'react';
import styled from 'styled-components';

interface StyledProps {
  checked?: boolean;
}

interface Props extends StyledProps {
  children?: React.ReactNode;
  position?: BallotTargetMarkPosition;
}

export const Bubble = styled.span<StyledProps>`
  display: inline-block;
  border: 1pt solid #000000; /* stylelint-disable-line unit-blacklist */
  border-radius: 100%;
  background: ${({ checked }) => (checked ? '#000000' : undefined)};
  width: 1.5em;
  height: 1em;
  vertical-align: bottom;
`;

const Container = styled.span<Props>`
  display: flex;
  flex-direction: ${({ position }) =>
    position === BallotTargetMarkPosition.Right ? 'row-reverse' : 'row'};
  align-items: flex-start;
  text-align: ${({ position }) =>
    position === BallotTargetMarkPosition.Right ? 'right' : 'left'};
  & > span:first-child {
    margin-top: 0.15em;
    margin-right: ${({ position }) =>
      position === BallotTargetMarkPosition.Right ? 'auto' : '0.3em'};
    margin-left: ${({ position }) =>
      position === BallotTargetMarkPosition.Right ? '0.5em;' : 'auto'};
  }
`;

const Content = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
`;

export function BubbleMark({
  checked = false,
  position = BallotTargetMarkPosition.Left,
  children,
}: Props): JSX.Element {
  return (
    <Container position={position}>
      <Bubble checked={checked} data-mark />
      <Content>{children}</Content>
    </Container>
  );
}

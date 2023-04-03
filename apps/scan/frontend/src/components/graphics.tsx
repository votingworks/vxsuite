import React from 'react';
import styled from 'styled-components';
import { Graphic } from '@votingworks/ui';

export const PlaceholderGraphic = styled.div`
  margin: 0 auto 1rem;
  border-radius: 1rem;
  background: #6638b6;
  width: 250px;
  height: 250px;
`;

export function QuestionCircle(): JSX.Element {
  return (
    <Graphic
      src="/assets/question-circle.svg"
      alt="question-circle"
      aria-hidden
    />
  );
}

export function DoNotEnter(): JSX.Element {
  return (
    <Graphic src="/assets/do-not-enter.svg" alt="do-not-enter" aria-hidden />
  );
}

export function CircleCheck(): JSX.Element {
  return (
    <Graphic src="/assets/check-circle.svg" alt="check-circle" aria-hidden />
  );
}

export function TimesCircle(): JSX.Element {
  return (
    <Graphic
      src="/assets/times-circle.svg"
      alt="times-circle"
      aria-hidden
      style={{ height: '400px' }}
    />
  );
}

export function ExclamationTriangle(): JSX.Element {
  return (
    <Graphic
      src="/assets/exclamation-triangle.svg"
      alt="exclamation-triangle"
      aria-hidden
    />
  );
}

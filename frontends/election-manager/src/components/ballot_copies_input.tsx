import { safeParseNumber } from '@votingworks/types';
import React from 'react';
import styled from 'styled-components';
import { InputEventFunction } from '../config/types';
import { TextInput } from './text_input';

const IncrementInput = styled(TextInput)`
  width: 4em;
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    opacity: 1;
  }
`;

interface Props {
  ballotCopies: number;
  setBallotCopies: (ballotCopies: number) => void;
}

export function BallotCopiesInput({
  ballotCopies,
  setBallotCopies,
}: Props): JSX.Element {
  const updateBallotCopies: InputEventFunction = (event) => {
    const { value } = event.currentTarget;
    const parsedValue = safeParseNumber(value);
    const copies = parsedValue.isOk() ? parsedValue.ok() : 1;
    setBallotCopies(copies < 1 ? 1 : copies);
  };

  return (
    <IncrementInput
      name="copies"
      defaultValue={ballotCopies}
      type="number"
      min={1}
      step={1}
      pattern="\d*"
      onChange={updateBallotCopies}
    />
  );
}

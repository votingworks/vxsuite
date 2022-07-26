import React from 'react';
import { Button, SegmentedButton } from './button';

interface Props {
  isAbsentee: boolean;
  setIsAbsentee: (isAbsentee: boolean) => void;
}

export function BallotTypeToggle({
  isAbsentee,
  setIsAbsentee,
}: Props): JSX.Element {
  return (
    <SegmentedButton>
      <Button disabled={isAbsentee} onPress={() => setIsAbsentee(true)} small>
        Absentee
      </Button>
      <Button disabled={!isAbsentee} onPress={() => setIsAbsentee(false)} small>
        Precinct
      </Button>
    </SegmentedButton>
  );
}

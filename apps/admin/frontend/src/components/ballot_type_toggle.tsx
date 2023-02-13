import React from 'react';
import { Button, SegmentedButton } from '@votingworks/shared-frontend';

interface Props {
  isAbsentee: boolean;
  setIsAbsentee: (isAbsentee: boolean) => void;
  absenteeFirst?: boolean;
}

export function BallotTypeToggle({
  isAbsentee,
  setIsAbsentee,
  absenteeFirst = true,
}: Props): JSX.Element {
  const buttons = [
    <Button
      disabled={isAbsentee}
      onPress={() => setIsAbsentee(true)}
      key="absentee"
      small
    >
      Absentee
    </Button>,
    <Button
      disabled={!isAbsentee}
      onPress={() => setIsAbsentee(false)}
      key="precinct"
      small
    >
      Precinct
    </Button>,
  ];
  return (
    <SegmentedButton>
      {absenteeFirst ? buttons : buttons.reverse()}
    </SegmentedButton>
  );
}

import {
  CheckInBallotParty,
  VoterIdentificationMethod,
} from '@votingworks/types';
import {
  Button,
  ButtonBar,
  H1,
  MainContent,
  MainHeader,
  P,
} from '@votingworks/ui';
import { useState } from 'react';
import { assertDefined, Optional } from '@votingworks/basics';
import { NoNavScreen } from './nav_screen';
import { Column, Row } from './layout';

interface SelectPartyScreenProps {
  voterId: string;
  identificationMethod: VoterIdentificationMethod;
  onConfirmCheckIn: (
    voterId: string,
    identificationMethod: VoterIdentificationMethod,
    ballotParty: CheckInBallotParty
  ) => void;
  onBack: () => void;
}

export function SelectPartyScreen({
  voterId,
  identificationMethod,
  onConfirmCheckIn,
  onBack,
}: SelectPartyScreenProps): JSX.Element {
  const [selectedBallotParty, setSelectedBallotParty] =
    useState<Optional<CheckInBallotParty>>(undefined);

  return (
    <NoNavScreen>
      <MainHeader>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Select Party</H1>
        </Row>
      </MainHeader>
      <MainContent>
        <P>Select the voter&apos;s choice of party:</P>
        <Row
          style={{
            justifyContent: 'center',
            gap: '4rem',
            marginTop: '1rem',
          }}
        >
          <Column style={{ flexGrow: 0.25 }}>
            <Button
              color="primary"
              fill={selectedBallotParty === 'DEM' ? 'filled' : 'outlined'}
              onPress={() => {
                setSelectedBallotParty('DEM');
              }}
            >
              Democratic
            </Button>
          </Column>
          <Column style={{ flexGrow: 0.25 }}>
            <Button
              color="primary"
              fill={selectedBallotParty === 'REP' ? 'filled' : 'outlined'}
              onPress={() => {
                setSelectedBallotParty('REP');
              }}
            >
              Republican
            </Button>
          </Column>
        </Row>
      </MainContent>
      <ButtonBar>
        <Button
          rightIcon="Next"
          variant="primary"
          disabled={!selectedBallotParty}
          onPress={() => {
            onConfirmCheckIn(
              voterId,
              identificationMethod,
              assertDefined(selectedBallotParty)
            );
          }}
          style={{ flex: 1 }}
        >
          Confirm Check-In
        </Button>
        <Button icon="Previous" onPress={onBack} style={{ flex: 1 }}>
          Back
        </Button>
      </ButtonBar>
    </NoNavScreen>
  );
}

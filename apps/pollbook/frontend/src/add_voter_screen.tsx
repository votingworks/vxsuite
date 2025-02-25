import {
  Button,
  ButtonBar,
  Callout,
  H1,
  MainContent,
  MainHeader,
  SearchSelect,
} from '@votingworks/ui';
import { useMemo, useState } from 'react';
import type { VoterRegistrationRequest } from '@votingworks/pollbook-backend';
import { Column, Row, FieldName } from './layout';
import { PollWorkerNavScreen } from './nav_screen';
import { AddressInputGroup } from './address_input_group';
import { RequiredStaticInput } from './shared_components';
import { NameInputGroup } from './name_input_group';

function createBlankVoter(): VoterRegistrationRequest {
  return {
    firstName: '',
    lastName: '',
    middleName: '',
    suffix: '',
    party: '',
    streetNumber: '',
    streetName: '',
    streetSuffix: '',
    houseFractionNumber: '',
    apartmentUnitNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: '',
    state: 'NH',
    zipCode: '',
  };
}

export function AddVoterScreen({
  onSubmit,
}: {
  onSubmit: (voter: VoterRegistrationRequest) => void;
}): JSX.Element {
  const [voter, setVoter] = useState<VoterRegistrationRequest>(
    createBlankVoter()
  );

  const isAddressValid = !(voter.city === '' || voter.zipCode === '');

  const isSubmitDisabled = useMemo(
    () =>
      voter.firstName.trim() === '' ||
      voter.lastName.trim() === '' ||
      voter.streetName.trim() === '' ||
      voter.party.trim() === '' ||
      !isAddressValid,
    [voter, isAddressValid]
  );

  function handleSubmit() {
    onSubmit({
      ...voter,
      streetNumber: voter.streetNumber.replace(/[^0-9]/g, ''),
      streetSuffix: voter.streetNumber.replace(/[0-9]/g, ''),
    });
  }

  return (
    <PollWorkerNavScreen>
      <MainHeader>
        <H1>Voter Registration</H1>
      </MainHeader>
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          <NameInputGroup
            name={voter}
            onChange={(name) => setVoter({ ...voter, ...name })}
          />
          <AddressInputGroup
            address={voter}
            onChange={(address) => setVoter({ ...voter, ...address })}
          />
          <Row style={{ gap: '1rem' }}>
            <RequiredStaticInput>
              <FieldName>Party Affiliation</FieldName>
              <SearchSelect
                id="party"
                style={{ width: '20rem' }}
                value={voter.party || undefined}
                onChange={(value) => setVoter({ ...voter, party: value || '' })}
                options={[
                  { value: 'REP', label: 'Republican' },
                  { value: 'DEM', label: 'Democrat' },
                  { value: 'UND', label: 'Undeclared' },
                ]}
              />
            </RequiredStaticInput>
          </Row>
          {voter.streetNumber.trim() !== '' &&
            voter.streetName !== '' &&
            !isAddressValid && (
              <Callout icon="Danger" color="danger">
                Invalid address. Make sure the street number and name match a
                valid address for this jurisdiction.
              </Callout>
            )}
        </Column>
      </MainContent>
      <ButtonBar>
        <Button
          icon="Add"
          variant="primary"
          onPress={handleSubmit}
          style={{ flex: 1 }}
          disabled={isSubmitDisabled}
        >
          Add Voter
        </Button>
        <div />
      </ButtonBar>
    </PollWorkerNavScreen>
  );
}

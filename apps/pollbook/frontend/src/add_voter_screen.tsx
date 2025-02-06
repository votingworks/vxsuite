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
import styled from 'styled-components';
import { safeParseInt } from '@votingworks/types';
import { Column, Row, FieldName } from './layout';
import { NoNavScreen } from './nav_screen';
import { getValidStreetInfo } from './api';

const TextField = styled.input`
  width: 100%;
  text-transform: uppercase;
`;

const ExpandableInput = styled(Column)`
  flex: 1;
`;
const StaticInput = styled(Column)`
  flex: 0;
`;
const RequiredExpandableInput = styled(ExpandableInput)`
  & > *:first-child::after {
    content: ' *';
    color: red;
  }
`;
const RequiredStaticInput = styled(StaticInput)`
  & > *:first-child::after {
    content: ' *';
    color: red;
  }
`;

export function AddVoterScreen({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (registration: VoterRegistrationRequest) => void;
}): JSX.Element {
  const [voter, setVoter] = useState<VoterRegistrationRequest>({
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
    zipCode: '',
  });

  const validStreetInfoQuery = getValidStreetInfo.useQuery();

  // Compute deduplicated street names
  const dedupedStreetNames = useMemo(
    () =>
      validStreetInfoQuery.data
        ? Array.from(
            new Set(validStreetInfoQuery.data.map((info) => info.streetName))
          )
        : [],
    [validStreetInfoQuery.data]
  );

  // Compute valid street info options for the selected street name
  const selectedStreetInfoForStreetNames = useMemo(
    () =>
      validStreetInfoQuery.data
        ? validStreetInfoQuery.data.filter(
            (info) => info.streetName === voter.streetName
          )
        : [],
    [validStreetInfoQuery.data, voter.streetName]
  );

  const voterStreetNum = useMemo(() => {
    const numericPart = voter.streetNumber.replace(/[^0-9]/g, '');
    return safeParseInt(numericPart).ok();
  }, [voter.streetNumber]);

  const selectedStreetInfoForStreetNameAndNumber = useMemo(
    () =>
      voterStreetNum !== undefined
        ? selectedStreetInfoForStreetNames.filter(
            (info) =>
              voterStreetNum >= info.lowRange &&
              voterStreetNum <= info.highRange &&
              (info.side === 'all' ||
                (voterStreetNum - info.lowRange) % 2 === 0)
          )[0]
        : undefined,
    [selectedStreetInfoForStreetNames, voterStreetNum]
  );

  // Populate city and zipCode from the first matching street info
  const cityValue = useMemo(
    () => selectedStreetInfoForStreetNameAndNumber?.postalCity || '',
    [selectedStreetInfoForStreetNameAndNumber]
  );
  const zipCodeValue = useMemo(
    () => selectedStreetInfoForStreetNameAndNumber?.zip5.padStart(5, '0') || '',
    [selectedStreetInfoForStreetNameAndNumber]
  );

  // Compute if the submit button should be disabled
  const isSubmitDisabled = useMemo(
    () =>
      voter.firstName.trim() === '' ||
      voter.lastName.trim() === '' ||
      voter.streetName.trim() === '' ||
      voter.party.trim() === '' ||
      selectedStreetInfoForStreetNameAndNumber === undefined,
    [voter, selectedStreetInfoForStreetNameAndNumber]
  );

  function handleSubmit() {
    // Function to be implemented later to call the correct backend mutation endpoint
    // For now, just call onSuccess with the voter data
    onSubmit({
      ...voter,
      firstName: voter.firstName.toUpperCase(),
      lastName: voter.lastName.toUpperCase(),
      middleName: voter.middleName.toUpperCase(),
      suffix: voter.suffix.toUpperCase(),
      city: cityValue.toUpperCase(),
      zipCode: zipCodeValue,
      streetNumber: voter.streetNumber.replace(/[^0-9]/g, ''),
      streetSuffix: voter.streetNumber.replace(/[0-9]/g, '').toUpperCase(),
      addressLine2: voter.addressLine2.toUpperCase(),
      apartmentUnitNumber: voter.apartmentUnitNumber.toUpperCase(),
    });
  }

  return (
    <NoNavScreen>
      <MainHeader>
        <H1>Add New Voter</H1>
      </MainHeader>
      <MainContent style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Row 1: Name Line */}
        <Row style={{ gap: '1rem', flexGrow: 1 }}>
          <RequiredExpandableInput>
            <FieldName>Last Name</FieldName>
            <TextField
              value={voter.lastName}
              onChange={(e) => setVoter({ ...voter, lastName: e.target.value })}
            />
          </RequiredExpandableInput>
          <RequiredExpandableInput>
            <FieldName>First Name</FieldName>
            <TextField
              value={voter.firstName}
              onChange={(e) =>
                setVoter({ ...voter, firstName: e.target.value })
              }
            />
          </RequiredExpandableInput>
          <ExpandableInput>
            <FieldName>Middle Name</FieldName>
            <TextField
              value={voter.middleName}
              onChange={(e) =>
                setVoter({ ...voter, middleName: e.target.value })
              }
            />
          </ExpandableInput>
          <StaticInput>
            <FieldName>Suffix</FieldName>
            <TextField
              value={voter.suffix}
              style={{ width: '5rem' }}
              onChange={(e) => setVoter({ ...voter, suffix: e.target.value })}
            />
          </StaticInput>
        </Row>
        <Row style={{ gap: '1rem', flexGrow: 1 }}>
          <RequiredStaticInput>
            <FieldName>Street #</FieldName>
            <TextField
              id="streetNumber"
              value={voter.streetNumber}
              style={{ width: '8rem' }}
              onChange={(e) =>
                setVoter({ ...voter, streetNumber: e.target.value })
              }
            />
          </RequiredStaticInput>
          <RequiredExpandableInput>
            <FieldName>Street Name</FieldName>
            <SearchSelect
              id="streetName"
              value={voter.streetName}
              style={{ flex: 1 }}
              onChange={(value) =>
                setVoter({
                  ...voter,
                  streetName: value || '',
                })
              }
              options={dedupedStreetNames.map((name) => ({
                value: name,
                label: name,
              }))}
            />
          </RequiredExpandableInput>
          <StaticInput>
            <FieldName>Apartment/Unit #</FieldName>
            <TextField
              value={voter.apartmentUnitNumber}
              style={{ width: '8rem' }}
              onChange={(e) =>
                setVoter({ ...voter, apartmentUnitNumber: e.target.value })
              }
            />
          </StaticInput>
        </Row>
        <Row style={{ gap: '1rem', flexGrow: 1 }}>
          <ExpandableInput>
            <FieldName>Address Line 2</FieldName>
            <TextField
              value={voter.addressLine2}
              onChange={(e) =>
                setVoter({ ...voter, addressLine2: e.target.value })
              }
            />
          </ExpandableInput>
          <RequiredExpandableInput>
            <FieldName>City</FieldName>
            <TextField value={cityValue} disabled />
          </RequiredExpandableInput>
          <RequiredExpandableInput>
            <FieldName>Zip Code</FieldName>
            <TextField value={zipCodeValue} disabled />
          </RequiredExpandableInput>
        </Row>
        <Row style={{ gap: '1rem', flexGrow: 1 }}>
          <RequiredStaticInput>
            <FieldName>Party Affiliation</FieldName>
            <SearchSelect
              id="party"
              style={{ width: '20rem' }}
              value={voter.party}
              onChange={(value) => setVoter({ ...voter, party: value || '' })}
              options={[
                { value: 'REP', label: 'Republican' },
                { value: 'DEM', label: 'Democrat' },
                { value: 'UND', label: 'Undecided' },
              ]}
            />
          </RequiredStaticInput>
        </Row>
      </MainContent>
      {voter.streetNumber.trim() !== '' &&
        voter.streetName !== '' &&
        selectedStreetInfoForStreetNameAndNumber === undefined && (
          <Callout
            icon="Danger"
            style={{ margin: '0 1rem 1rem 1rem' }}
            color="danger"
          >
            The street address is not valid, make sure the street number and
            name match a valid address for the current jurisdiction.
          </Callout>
        )}
      <ButtonBar>
        <Button
          rightIcon="Next"
          variant="primary"
          onPress={handleSubmit}
          style={{ flex: 1 }}
          disabled={isSubmitDisabled}
        >
          Add Voter
        </Button>
        <Button onPress={onCancel} style={{ flex: 1 }}>
          Cancel
        </Button>
      </ButtonBar>
    </NoNavScreen>
  );
}

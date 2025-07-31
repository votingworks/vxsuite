import { SearchSelect } from '@votingworks/ui';
import React from 'react';
import { VOTER_INPUT_FIELD_LIMITS } from '@votingworks/types';
import { Row, FieldName } from './layout';
import {
  RequiredStaticInput,
  TextField,
  RequiredExpandableInput,
  StaticInput,
  ExpandableInput,
} from './shared_components';
import { usStates } from './us_states';
import type { VoterMailingAddressChangeRequest } from './update_mailing_address_flow';
import { splitStreetNumberDetails } from './address_input_group';

export function MailingAddressInputGroup({
  mailingAddress,
  onChange,
}: {
  mailingAddress: VoterMailingAddressChangeRequest;
  onChange: (mailingAddress: VoterMailingAddressChangeRequest) => void;
}): JSX.Element {
  const [zipInput, setZipInput] = React.useState(
    mailingAddress.mailingZip5 +
      (mailingAddress.mailingZip4 ? `-${mailingAddress.mailingZip4}` : '')
  );
  const [useHouseFractionSeparator, setUseHouseFractionSeparator] =
    React.useState(!!mailingAddress.mailingHouseFractionNumber);
  function handleChange(newMailingAddress: VoterMailingAddressChangeRequest) {
    onChange(newMailingAddress);
  }

  return (
    <React.Fragment>
      <Row style={{ gap: '1rem' }}>
        <RequiredStaticInput>
          <FieldName>Street #</FieldName>
          <TextField
            aria-label="Mailing Street Number"
            id="mailingStreetNumber"
            value={
              mailingAddress.mailingStreetNumber +
              (useHouseFractionSeparator
                ? ` ${mailingAddress.mailingHouseFractionNumber}`
                : '') +
              mailingAddress.mailingSuffix
            }
            style={{ width: '8rem' }}
            onChange={(e) => {
              const inputValue = e.target.value.toLocaleUpperCase();
              const {
                streetNumber,
                streetSuffix,
                houseFractionNumber,
                useHouseFractionSeparator: newUseHouseFractionSeparator,
              } = splitStreetNumberDetails(inputValue);
              setUseHouseFractionSeparator(newUseHouseFractionSeparator);
              handleChange({
                ...mailingAddress,
                mailingStreetNumber: streetNumber,
                mailingSuffix: streetSuffix,
                mailingHouseFractionNumber: houseFractionNumber,
              });
            }}
          />
        </RequiredStaticInput>
        <RequiredExpandableInput>
          <FieldName>Street Name</FieldName>
          <TextField
            aria-label="Mailing Street Name"
            id="mailingStreetName"
            value={mailingAddress.mailingStreetName}
            onChange={(e) =>
              handleChange({
                ...mailingAddress,
                mailingStreetName: e.target.value
                  .toLocaleUpperCase()
                  .slice(0, VOTER_INPUT_FIELD_LIMITS.streetName),
              })
            }
          />
        </RequiredExpandableInput>
        <StaticInput>
          <FieldName>Apartment/Unit #</FieldName>
          <TextField
            aria-label="Mailing Apartment or Unit Number"
            value={mailingAddress.mailingApartmentUnitNumber}
            style={{ width: '8rem' }}
            onChange={(e) => {
              const value = e.target.value
                .toLocaleUpperCase()
                .slice(0, VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber);
              handleChange({
                ...mailingAddress,
                mailingApartmentUnitNumber: value,
              });
            }}
          />
        </StaticInput>
      </Row>
      <Row style={{ gap: '1rem' }}>
        <ExpandableInput>
          <FieldName>Address Line 2</FieldName>
          <TextField
            aria-label="Mailing Address Line 2"
            value={mailingAddress.mailingAddressLine2}
            onChange={(e) => {
              const value = e.target.value
                .toLocaleUpperCase()
                .slice(0, VOTER_INPUT_FIELD_LIMITS.addressLine2);
              handleChange({
                ...mailingAddress,
                mailingAddressLine2: value,
              });
            }}
          />
        </ExpandableInput>
        <RequiredExpandableInput>
          <FieldName>City</FieldName>
          <TextField
            aria-label="Mailing City"
            value={mailingAddress.mailingCityTown}
            onChange={(e) =>
              handleChange({
                ...mailingAddress,
                mailingCityTown: e.target.value
                  .toLocaleUpperCase()
                  .slice(0, VOTER_INPUT_FIELD_LIMITS.cityTown),
              })
            }
          />
        </RequiredExpandableInput>
        <RequiredExpandableInput>
          <FieldName>State</FieldName>
          <SearchSelect
            aria-label="Mailing State"
            id="mailingState"
            value={mailingAddress.mailingState}
            menuPortalTarget={document.body}
            style={{ flex: 1 }}
            onChange={(value) =>
              handleChange({
                ...mailingAddress,
                mailingState: value || '',
              })
            }
            options={Object.entries(usStates).map(([value, label]) => ({
              value,
              label: `${value} - ${label}`,
            }))}
            placeholder="Select state..."
          />
        </RequiredExpandableInput>
        <RequiredExpandableInput>
          <FieldName>Zip Code</FieldName>
          <TextField
            aria-label="Mailing Zip Code"
            value={zipInput}
            onChange={(e) => {
              const input = e.target.value
                .replace(/[^0-9-]/g, '')
                .toUpperCase();
              const [zip5, zip4] = input.split('-');
              const trimmedZip5 = zip5.slice(0, VOTER_INPUT_FIELD_LIMITS.zip5);
              const trimmedZip4 =
                zip4 !== undefined
                  ? `-${zip4.slice(0, VOTER_INPUT_FIELD_LIMITS.zip4)}`
                  : '';
              setZipInput(trimmedZip5 + trimmedZip4);
              handleChange({
                ...mailingAddress,
                mailingZip5: zip5.slice(0, VOTER_INPUT_FIELD_LIMITS.zip5),
                mailingZip4: zip4
                  ? zip4.slice(0, VOTER_INPUT_FIELD_LIMITS.zip4)
                  : '',
              });
            }}
          />
        </RequiredExpandableInput>
      </Row>
    </React.Fragment>
  );
}

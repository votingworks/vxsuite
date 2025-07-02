import { SearchSelect } from '@votingworks/ui';
import React from 'react';
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
import { splitStreetNumberAndSuffix } from './address_input_group';

export function MailingAddressInputGroup({
  mailingAddress,
  onChange,
}: {
  mailingAddress: VoterMailingAddressChangeRequest;
  onChange: (mailingAddress: VoterMailingAddressChangeRequest) => void;
}): JSX.Element {
  function handleChange(newMailingAddress: VoterMailingAddressChangeRequest) {
    console.log(newMailingAddress);
    console.log('onChange');
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
              mailingAddress.mailingStreetNumber + mailingAddress.mailingSuffix
            }
            style={{ width: '8rem' }}
            onChange={(e) => {
              const { streetNumber, streetSuffix } = splitStreetNumberAndSuffix(
                e.target.value.toLocaleUpperCase()
              );
              handleChange({
                ...mailingAddress,
                mailingStreetNumber: streetNumber,
                mailingSuffix: streetSuffix,
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
                mailingStreetName: e.target.value.toLocaleUpperCase(),
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
            onChange={(e) =>
              handleChange({
                ...mailingAddress,
                mailingApartmentUnitNumber: e.target.value.toLocaleUpperCase(),
              })
            }
          />
        </StaticInput>
      </Row>
      <Row style={{ gap: '1rem' }}>
        <ExpandableInput>
          <FieldName>Address Line 2</FieldName>
          <TextField
            aria-label="Mailing Address Line 2"
            value={mailingAddress.mailingAddressLine2}
            onChange={(e) =>
              handleChange({
                ...mailingAddress,
                mailingAddressLine2: e.target.value.toLocaleUpperCase(),
              })
            }
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
                mailingCityTown: e.target.value.toLocaleUpperCase(),
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
                mailingState: value || 'NH',
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
            value={mailingAddress.mailingZip5}
            onChange={(e) =>
              handleChange({
                ...mailingAddress,
                mailingZip5: e.target.value,
              })
            }
          />
        </RequiredExpandableInput>
      </Row>
    </React.Fragment>
  );
}

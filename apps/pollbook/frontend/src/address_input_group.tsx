import type {
  ValidStreetInfo,
  VoterAddressChangeRequest,
} from '@votingworks/pollbook-backend';
import { SearchSelect } from '@votingworks/ui';
import React, { useMemo } from 'react';
import { safeParseInt } from '@votingworks/types';
import { Row, FieldName } from './layout';
import {
  RequiredStaticInput,
  TextField,
  RequiredExpandableInput,
  StaticInput,
  ExpandableInput,
} from './shared_components';
import { getValidStreetInfo } from './api';

function findCityAndZipCodeFromStreetAddress(
  validStreetInfo: ValidStreetInfo[],
  address: VoterAddressChangeRequest
): { city: string; zipCode: string } {
  const streetInfosForStreetName = validStreetInfo.filter(
    (info) => info.streetName.toLocaleUpperCase() === address.streetName
  );
  const streetNumberNumericPart = address.streetNumber.replace(/[^0-9]/g, '');
  const voterStreetNum = safeParseInt(streetNumberNumericPart).ok();
  const streetInfo =
    voterStreetNum !== undefined
      ? streetInfosForStreetName.find(
          (info) =>
            voterStreetNum >= info.lowRange &&
            voterStreetNum <= info.highRange &&
            (info.side === 'all' || (voterStreetNum - info.lowRange) % 2 === 0)
        )
      : undefined;

  // Populate city and zipCode from the first matching street info
  return {
    city: streetInfo?.postalCity.toLocaleUpperCase() || '',
    zipCode: streetInfo?.zip5.padStart(5, '0') || '',
  };
}

function splitStreetNumberAndSuffix(input: string): {
  streetNumber: string;
  streetSuffix: string;
} {
  const match = input.match(/(\d+)(.*)/);
  const [, streetNumber = '', streetSuffix = ''] = match ?? [];
  return { streetNumber, streetSuffix };
}

export function AddressInputGroup({
  address,
  onChange,
}: {
  address: VoterAddressChangeRequest;
  onChange: (address: VoterAddressChangeRequest) => void;
}): JSX.Element {
  const validStreetInfoQuery = getValidStreetInfo.useQuery();

  const dedupedStreetNames = useMemo(
    () =>
      validStreetInfoQuery.data
        ? Array.from(
            new Set(
              validStreetInfoQuery.data.map((info) =>
                info.streetName.toLocaleUpperCase()
              )
            )
          )
        : [],
    [validStreetInfoQuery.data]
  );

  function handleChange(newAddress: VoterAddressChangeRequest) {
    const { city, zipCode } = findCityAndZipCodeFromStreetAddress(
      validStreetInfoQuery.data || [],
      newAddress
    );
    onChange({
      ...newAddress,
      city,
      zipCode,
    });
  }

  return (
    <React.Fragment>
      <Row style={{ gap: '1rem' }}>
        <RequiredStaticInput>
          <FieldName>Street #</FieldName>
          <TextField
            id="streetNumber"
            value={address.streetNumber + address.streetSuffix}
            style={{ width: '8rem' }}
            onChange={(e) =>
              handleChange({
                ...address,
                ...splitStreetNumberAndSuffix(
                  e.target.value.toLocaleUpperCase()
                ),
              })
            }
          />
        </RequiredStaticInput>
        <RequiredExpandableInput>
          <FieldName>Street Name</FieldName>
          <SearchSelect
            id="streetName"
            value={address.streetName || undefined}
            style={{ flex: 1 }}
            onChange={(value) =>
              handleChange({
                ...address,
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
            value={address.apartmentUnitNumber}
            style={{ width: '8rem' }}
            onChange={(e) =>
              handleChange({
                ...address,
                apartmentUnitNumber: e.target.value.toLocaleUpperCase(),
              })
            }
          />
        </StaticInput>
      </Row>
      <Row style={{ gap: '1rem' }}>
        <ExpandableInput>
          <FieldName>Address Line 2</FieldName>
          <TextField
            value={address.addressLine2}
            onChange={(e) =>
              handleChange({
                ...address,
                addressLine2: e.target.value.toLocaleUpperCase(),
              })
            }
          />
        </ExpandableInput>
        <RequiredExpandableInput>
          <FieldName>City</FieldName>
          <TextField value={address.city} disabled />
        </RequiredExpandableInput>
        <RequiredExpandableInput>
          <FieldName>Zip Code</FieldName>
          <TextField value={address.zipCode} disabled />
        </RequiredExpandableInput>
      </Row>
    </React.Fragment>
  );
}

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
import { VOTER_INPUT_FIELD_LIMITS } from './globals';

function findDetailsFromStreetAddress(
  validStreetInfo: ValidStreetInfo[],
  address: VoterAddressChangeRequest
): { city: string; zipCode: string; precinct: string } {
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
    city: streetInfo?.postalCityTown.toLocaleUpperCase() || '',
    zipCode: streetInfo?.zip5.padStart(5, '0') || '',
    precinct: streetInfo?.precinct || '',
  };
}

export function splitStreetNumberDetails(input: string): {
  streetNumber: string;
  streetSuffix: string;
  houseFractionNumber: string;
  useHouseFractionSeparator: boolean;
} {
  // First, try to match the complete valid pattern
  // This regex handles multiple cases:
  // - Street number only: "16"
  // - Street number + suffix: "16B" or "16 B"
  // - Street number + fraction: "16 1/2" or "161/2"
  // - Street number + incomplete fraction: "16 1/"
  // - Street number + fraction + suffix: "16 1/2B" or "16 1B"
  // Pattern explanation:
  // (\d+) - street number
  // (?:\s*(\d+(?:\/\d*)?))? - optional fraction (with optional space before), supports incomplete fractions
  // (?:\s*([A-Za-z]+))? - optional suffix (with optional space before)
  // \s* - optional trailing space
  const match = input.match(
    /^(\d+)(?:\s*(\d+(?:\/\d*)?))?(?:\s*([A-Za-z]+))?\s*$/
  );

  // If the full pattern doesn't match, try to extract what we can
  if (!match) {
    // Try to extract just the street number and suffix, ignoring invalid characters
    const partialMatch = input.match(/^(\d+)([A-Za-z]*)/);
    if (partialMatch) {
      const [, streetNumber, streetSuffix] = partialMatch;
      const trimmedStreetNumber = streetNumber.slice(
        0,
        VOTER_INPUT_FIELD_LIMITS.streetNumber
      );
      const trimmedStreetSuffix = streetSuffix.slice(
        0,
        VOTER_INPUT_FIELD_LIMITS.streetSuffix
      );
      return {
        streetNumber: trimmedStreetNumber,
        streetSuffix: trimmedStreetSuffix,
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      };
    }
    // If no valid pattern found, return empty values
    return {
      streetNumber: '',
      streetSuffix: '',
      houseFractionNumber: '',
      useHouseFractionSeparator: false,
    };
  }

  const [, streetNumber = '', houseFractionNumber = '', streetSuffix = ''] =
    match;

  // useHouseFractionSeparator should be true if:
  // 1. There's a house fraction number, OR
  // 2. Input ends with space but NOT when there's already a suffix (like "16B ") as a fraction must come first.
  const hasTrailingSpace = input.endsWith(' ');
  const useHouseFractionSeparator =
    !!houseFractionNumber || (hasTrailingSpace && !streetSuffix);

  return {
    streetNumber: streetNumber.slice(0, VOTER_INPUT_FIELD_LIMITS.streetNumber),
    streetSuffix: streetSuffix.slice(0, VOTER_INPUT_FIELD_LIMITS.streetSuffix),
    houseFractionNumber,
    useHouseFractionSeparator,
  };
}

export function AddressInputGroup({
  address,
  onChange,
}: {
  address: VoterAddressChangeRequest;
  onChange: (address: VoterAddressChangeRequest) => void;
}): JSX.Element {
  const validStreetInfoQuery = getValidStreetInfo.useQuery();

  const [useHouseFractionSeparator, setUseHouseFractionSeparator] =
    React.useState(!!address.houseFractionNumber);

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
    const { city, zipCode, precinct } = findDetailsFromStreetAddress(
      validStreetInfoQuery.data || [],
      newAddress
    );
    onChange({
      ...newAddress,
      city,
      zipCode,
      precinct,
    });
  }

  return (
    <React.Fragment>
      <Row style={{ gap: '1rem' }}>
        <RequiredStaticInput>
          <FieldName>Street #</FieldName>
          <TextField
            aria-label="Street Number"
            id="streetNumber"
            value={
              address.streetNumber +
              (useHouseFractionSeparator
                ? ` ${address.houseFractionNumber}`
                : '') +
              address.streetSuffix
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
                ...address,
                streetNumber,
                streetSuffix,
                houseFractionNumber,
              });
            }}
          />
        </RequiredStaticInput>
        <RequiredExpandableInput>
          <FieldName>Street Name</FieldName>
          <SearchSelect
            aria-label="Street Name"
            id="streetName"
            value={address.streetName || undefined}
            menuPortalTarget={document.body}
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
            aria-label="Apartment or Unit Number"
            value={address.apartmentUnitNumber}
            style={{ width: '8rem' }}
            onChange={(e) => {
              const value = e.target.value
                .toLocaleUpperCase()
                .slice(0, VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber);
              handleChange({
                ...address,
                apartmentUnitNumber: value,
              });
            }}
          />
        </StaticInput>
      </Row>
      <Row style={{ gap: '1rem' }}>
        <ExpandableInput>
          <FieldName>Address Line 2</FieldName>
          <TextField
            aria-label="Address Line 2"
            value={address.addressLine2}
            onChange={(e) => {
              const value = e.target.value
                .toLocaleUpperCase()
                .slice(0, VOTER_INPUT_FIELD_LIMITS.addressLine2);
              handleChange({
                ...address,
                addressLine2: value,
              });
            }}
          />
        </ExpandableInput>
        <RequiredExpandableInput>
          <FieldName>City</FieldName>
          <TextField aria-label="City" value={address.city} disabled />
        </RequiredExpandableInput>
        <RequiredExpandableInput>
          <FieldName>Zip Code</FieldName>
          <TextField aria-label="Zip Code" value={address.zipCode} disabled />
        </RequiredExpandableInput>
      </Row>
    </React.Fragment>
  );
}

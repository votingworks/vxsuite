export const AUTOMATIC_FLOW_STATE_RESET_DELAY_MS = 3000;
export const PRINTING_INDICATOR_DELAY_MS = 2000;
export const SOCKET_IO_SERVER_ADDRESS = 'http://localhost:3002';

export const VOTER_INPUT_FIELD_LIMITS = {
  firstName: 50,
  lastName: 75,
  middleName: 50,
  nameSuffix: 5,
  streetNumber: 6,
  streetName: 50,
  streetSuffix: 4,
  apartmentUnitNumber: 15,
  addressLine2: 75,
  zip5: 5,
  zip4: 4,
  cityTown: 50,
} as const;

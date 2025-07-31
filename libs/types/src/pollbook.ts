import z from 'zod/v4';

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

export type VoterIdentificationMethod =
  | { type: 'default' }
  | {
      type: 'outOfStateLicense';
      state: string;
    };

export type PartyAbbreviation = 'DEM' | 'REP' | 'UND';
export const PartyAbbreviationSchema = z.union([
  z.literal('DEM'),
  z.literal('REP'),
  z.literal('UND'),
]);

export type CheckInBallotParty = 'DEM' | 'REP' | 'NOT_APPLICABLE';
export const CheckInBallotPartySchema = z.union([
  z.literal('DEM'),
  z.literal('REP'),
  z.literal('NOT_APPLICABLE'),
]);

export interface VoterCheckIn {
  identificationMethod: VoterIdentificationMethod;
  isAbsentee: boolean;
  timestamp: string;
  machineId: string;
  receiptNumber: number;
  ballotParty: CheckInBallotParty;
}

export const VoterCheckInSchema: z.ZodSchema<VoterCheckIn> = z.object({
  identificationMethod: z.union([
    z.object({
      type: z.literal('default'),
    }),
    z.object({
      type: z.literal('outOfStateLicense'),
      state: z.string(),
    }),
  ]),
  isAbsentee: z.boolean(),
  timestamp: z.string(),
  machineId: z.string(),
  receiptNumber: z.number(),
  ballotParty: CheckInBallotPartySchema,
});

export interface Voter {
  voterId: string;
  lastName: string;
  suffix: string;
  firstName: string;
  middleName: string;
  streetNumber: string;
  addressSuffix: string;
  houseFractionNumber: string;
  streetName: string;
  apartmentUnitNumber: string;
  addressLine2: string;
  addressLine3: string;
  postalCityTown: string;
  state: string;
  postalZip5: string;
  zip4: string;
  mailingStreetNumber: string;
  mailingSuffix: string;
  mailingHouseFractionNumber: string;
  mailingStreetName: string;
  mailingApartmentUnitNumber: string;
  mailingAddressLine2: string;
  mailingAddressLine3: string;
  mailingCityTown: string;
  mailingState: string;
  mailingZip5: string;
  mailingZip4: string;
  party: PartyAbbreviation;
  precinct: string;
  nameChange?: VoterNameChange;
  addressChange?: VoterAddressChange;
  mailingAddressChange?: VoterMailingAddressChange;
  registrationEvent?: VoterRegistration;
  checkIn?: VoterCheckIn;
  isInactive: boolean;
}

export interface VoterAddressChangeRequest {
  streetNumber: string;
  streetName: string;
  streetSuffix: string;
  apartmentUnitNumber: string;
  houseFractionNumber: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  state: string;
  zipCode: string;
  precinct: string;
}

export interface VoterAddressChange extends VoterAddressChangeRequest {
  timestamp: string;
}

const VoterAddressChangeSchemaInternal = z.object({
  streetNumber: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetNumber)
    ),
  streetSuffix: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetSuffix)
    ),
  apartmentUnitNumber: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    ),
  addressLine2: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.addressLine2)
    ),
  houseFractionNumber: z.string(),
  addressLine3: z.string(),
  // controlled by valid street name definition, does not need truncation
  streetName: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  timestamp: z.string(),
  precinct: z.string(),
});

export const VoterAddressChangeSchema: z.ZodSchema<VoterAddressChange> =
  VoterAddressChangeSchemaInternal;

export interface VoterMailingAddressChangeRequest {
  mailingStreetNumber: string;
  mailingStreetName: string;
  mailingSuffix: string;
  mailingApartmentUnitNumber: string;
  mailingHouseFractionNumber: string;
  mailingAddressLine2: string;
  mailingAddressLine3: string;
  mailingCityTown: string;
  mailingState: string;
  mailingZip5: string;
  mailingZip4: string;
}

export interface VoterMailingAddressChange
  extends VoterMailingAddressChangeRequest {
  timestamp: string;
}

export function truncateToMaxLength(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

const VoterMailingAddressChangeSchemaInternal = z.object({
  mailingStreetNumber: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.streetNumber)
    ),
  mailingStreetName: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.streetName)
    ),
  mailingSuffix: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.nameSuffix)
    ),
  mailingApartmentUnitNumber: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    ),
  mailingHouseFractionNumber: z.string(),
  mailingAddressLine2: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.addressLine2)
    ),
  mailingAddressLine3: z.string(),
  mailingCityTown: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.cityTown)
    ),
  mailingState: z.string(),
  mailingZip5: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.zip5)
    ),
  mailingZip4: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.zip4)
    ),
  timestamp: z.string(),
});

export const VoterMailingAddressChangeSchema: z.ZodSchema<VoterMailingAddressChange> =
  VoterMailingAddressChangeSchemaInternal;

export interface VoterNameChangeRequest {
  lastName: string;
  suffix: string;
  firstName: string;
  middleName: string;
}

export interface VoterNameChange extends VoterNameChangeRequest {
  timestamp: string;
}

const VoterNameChangeSchemaInternal = z.object({
  lastName: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.lastName)
    ),
  suffix: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.nameSuffix)
    ),
  firstName: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.firstName)
    ),
  middleName: z
    .string()
    .transform((value) =>
      truncateToMaxLength(value, VOTER_INPUT_FIELD_LIMITS.middleName)
    ),
  timestamp: z.string(),
});

export const VoterNameChangeSchema: z.ZodSchema<VoterNameChange> =
  VoterNameChangeSchemaInternal;

export interface VoterRegistrationRequest
  extends VoterAddressChangeRequest,
    VoterNameChangeRequest {
  party: PartyAbbreviation | '';
}

export interface VoterRegistration extends VoterRegistrationRequest {
  party: PartyAbbreviation;
  timestamp: string;
  voterId: string;
  precinct: string;
}

export const VoterRegistrationSchema: z.ZodSchema<VoterRegistration> =
  VoterAddressChangeSchemaInternal.merge(VoterNameChangeSchemaInternal).extend({
    party: PartyAbbreviationSchema,
    timestamp: z.string(),
    voterId: z.string(),
    precinct: z.string(),
  });

export const VoterSchema: z.ZodSchema<Voter> = z.object({
  voterId: z.string(),
  lastName: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.lastName)),
  suffix: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.nameSuffix)),
  firstName: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.firstName)),
  middleName: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.middleName)),
  streetNumber: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetNumber)
    ),
  addressSuffix: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetSuffix)
    ),
  houseFractionNumber: z.string(),
  streetName: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetName)),
  apartmentUnitNumber: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    ),
  addressLine2: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.addressLine2)
    ),
  addressLine3: z.string(),
  postalCityTown: z.string(),
  state: z.string(),
  postalZip5: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.zip5)),
  zip4: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.zip4)),
  mailingStreetNumber: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetNumber)
    ),
  mailingSuffix: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetSuffix)
    ),
  mailingHouseFractionNumber: z.string(),
  mailingStreetName: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetName)),
  mailingApartmentUnitNumber: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    ),
  mailingAddressLine2: z
    .string()
    .transform((value) =>
      value.slice(0, VOTER_INPUT_FIELD_LIMITS.addressLine2)
    ),
  mailingAddressLine3: z.string(),
  mailingCityTown: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.cityTown)),
  mailingState: z.string(),
  mailingZip5: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.zip5)),
  mailingZip4: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.zip4)),
  party: PartyAbbreviationSchema,
  precinct: z.string(),
  checkIn: VoterCheckInSchema.optional(),
  registrationEvent: VoterRegistrationSchema.optional(),
  addressChange: VoterAddressChangeSchema.optional(),
  nameChange: VoterNameChangeSchema.optional(),
  isInactive: z.boolean().default(false),
});

export type StreetSide = 'even' | 'odd' | 'all';

export interface ValidStreetInfo {
  streetName: string;
  side: StreetSide;
  lowRange: number;
  highRange: number;
  postalCityTown: string;
  precinct: string;
  city?: string;
  zip5: string;
  zip4: string;
}

export const ValidStreetInfoSchema: z.ZodSchema<ValidStreetInfo[]> = z.array(
  z.object({
    streetName: z
      .string()
      .transform((value) =>
        value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetName)
      ),
    side: z.union([z.literal('even'), z.literal('odd'), z.literal('all')]),
    lowRange: z.number(),
    highRange: z.number(),
    postalCityTown: z
      .string()
      .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.cityTown)),
    zip5: z
      .string()
      .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.zip5)),
    zip4: z
      .string()
      .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.zip4)),
    precinct: z.string(),
  })
);

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

export const VoterCheckInSchema = z.object({
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

export interface VoterCheckIn extends z.infer<typeof VoterCheckInSchema> {}

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

export const VoterAddressChangeSchema = VoterAddressChangeSchemaInternal;

export interface VoterAddressChange
  extends z.infer<typeof VoterAddressChangeSchema> {}

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

export const VoterMailingAddressChangeSchema =
  VoterMailingAddressChangeSchemaInternal;

export interface VoterMailingAddressChange
  extends z.infer<typeof VoterMailingAddressChangeSchema> {}

export interface VoterNameChangeRequest {
  lastName: string;
  suffix: string;
  firstName: string;
  middleName: string;
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

export const VoterNameChangeSchema = VoterNameChangeSchemaInternal;

export interface VoterNameChange
  extends z.infer<typeof VoterNameChangeSchema> {}

export interface VoterRegistrationRequest
  extends VoterAddressChangeRequest,
    VoterNameChangeRequest {
  party: PartyAbbreviation | '';
}


export const VoterRegistrationSchema =
  VoterAddressChangeSchemaInternal.merge(VoterNameChangeSchemaInternal).extend({
    party: PartyAbbreviationSchema,
    timestamp: z.string(),
    voterId: z.string(),
    precinct: z.string(),
  });

export interface VoterRegistration
  extends z.infer<typeof VoterRegistrationSchema> {}

export const VoterSchema = z.object({
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
  mailingAddressChange: VoterMailingAddressChangeSchema.optional(),
  isInactive: z.boolean().default(false),
});

export interface Voter extends z.infer<typeof VoterSchema> {}

export type StreetSide = 'even' | 'odd' | 'all';

const ValidStreetInfoItemSchema = z.object({
  streetName: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.streetName)),
  side: z.union([z.literal('even'), z.literal('odd'), z.literal('all')]),
  lowRange: z.number(),
  highRange: z.number(),
  postalCityTown: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.cityTown)),
  city: z.string().optional(),
  zip5: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.zip5)),
  zip4: z
    .string()
    .transform((value) => value.slice(0, VOTER_INPUT_FIELD_LIMITS.zip4)),
  precinct: z.string(),
});

export interface ValidStreetInfo
  extends z.infer<typeof ValidStreetInfoItemSchema> {}

export const ValidStreetInfoSchema = z.array(ValidStreetInfoItemSchema);

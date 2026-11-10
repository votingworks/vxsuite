import type { DistrictId } from '@votingworks/types';

export type DuplicateElectionError = 'duplicate-title-and-date';

export type DuplicateDistrictErrorCode = 'duplicate-name';

export interface DuplicateDistrictError {
  code: DuplicateDistrictErrorCode;
  districtId: DistrictId;
}

export type DuplicatePrecinctError =
  | 'duplicate-precinct-name'
  | 'duplicate-split-name'
  | 'duplicate-split-districts';

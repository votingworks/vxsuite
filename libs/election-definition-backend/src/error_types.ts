import type { DistrictId } from '@votingworks/types';

export type DuplicateElectionError = 'duplicate-title-and-date';

export type DuplicateDistrictErrorCode = 'duplicate-name';

export interface DuplicateDistrictError {
  code: DuplicateDistrictErrorCode;
  districtId: DistrictId;
}

import {
  AVAILABLE_DISK_SPACE_RATIO_WARNING_THRESHOLD,
  type DiskSpaceSummary,
} from '@votingworks/utils';
import { format } from '@votingworks/utils';
import { H2, P } from '../typography.js';
import { SuccessIcon, WarningIcon } from './icons.js';

function roundToGigabytes(kilobytes: number): number {
  return Math.round(kilobytes / 100_000) / 10;
}

export interface StorageSectionProps {
  diskSpaceSummary: DiskSpaceSummary;
}

export function StorageSection({
  diskSpaceSummary,
}: StorageSectionProps): JSX.Element {
  const storageAvailableRatio =
    diskSpaceSummary.available / diskSpaceSummary.total;

  return (
    <section>
      <H2>Storage</H2>
      <P>
        {storageAvailableRatio <
        AVAILABLE_DISK_SPACE_RATIO_WARNING_THRESHOLD ? (
          <WarningIcon />
        ) : (
          <SuccessIcon />
        )}{' '}
        Free Disk Space: {format.percent(storageAvailableRatio)} (
        {roundToGigabytes(diskSpaceSummary.available)} GB /{' '}
        {roundToGigabytes(diskSpaceSummary.total)} GB)
      </P>
    </section>
  );
}

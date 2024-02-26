import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import { LaptopSection } from './laptop_section';

export function CentralScanReadinessReportContents({
  batteryInfo,
  diskSpaceSummary,
}: {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
}): JSX.Element {
  return (
    <div>
      <LaptopSection
        batteryInfo={batteryInfo}
        diskSpaceSummary={diskSpaceSummary}
      />
    </div>
  );
}

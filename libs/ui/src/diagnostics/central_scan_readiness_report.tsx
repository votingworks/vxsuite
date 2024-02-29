import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import { LaptopSection } from './laptop_section';
import { CentralScannerSection } from './central_scanner_section';

export function CentralScanReadinessReportContents({
  batteryInfo,
  diskSpaceSummary,
  isScannerAttached,
}: {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
  isScannerAttached: boolean;
}): JSX.Element {
  return (
    <div>
      <LaptopSection
        batteryInfo={batteryInfo}
        diskSpaceSummary={diskSpaceSummary}
      />
      <CentralScannerSection isScannerAttached={isScannerAttached} />
    </div>
  );
}

import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import { DiagnosticsRecord, PrinterStatus } from '@votingworks/types';
import React from 'react';
import { LaptopSection } from './laptop_section';
import { PrinterSection } from './printer_section';

export function AdminReadinessReportContents({
  batteryInfo,
  diskSpaceSummary,
  printerStatus,
  mostRecentPrinterDiagnostic,
}: {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
  printerStatus: PrinterStatus;
  mostRecentPrinterDiagnostic?: DiagnosticsRecord;
}): JSX.Element {
  return (
    <React.Fragment>
      <LaptopSection
        batteryInfo={batteryInfo}
        diskSpaceSummary={diskSpaceSummary}
      />
      <PrinterSection
        printerStatus={printerStatus}
        mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
      />
    </React.Fragment>
  );
}

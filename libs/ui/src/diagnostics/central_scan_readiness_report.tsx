import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import { ThemeProvider } from 'styled-components';
import { LaptopSection } from './laptop_section';
import { CentralScannerSection } from './central_scanner_section';
import { makeTheme } from '../themes/make_theme';
import { PrintedReport } from '../reports/layout';
import { ReadinessReportHeader } from './report_header';

interface ReportContentsProps {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
  isScannerAttached: boolean;
}

export function CentralScanReadinessReportContents({
  batteryInfo,
  diskSpaceSummary,
  isScannerAttached,
}: ReportContentsProps): JSX.Element {
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

export function CentralScanReadinessReport({
  generatedAtTime,
  machineId,
  ...contentProps
}: {
  generatedAtTime: Date;
  machineId: string;
} & ReportContentsProps): JSX.Element {
  return (
    <ThemeProvider
      theme={makeTheme({
        sizeMode: 'desktop',
        colorMode: 'desktop',
        screenType: 'builtIn',
      })}
    >
      <PrintedReport>
        <ReadinessReportHeader
          machineType="VxCentralScan"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <CentralScanReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}

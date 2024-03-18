import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import { ThemeProvider } from 'styled-components';
import { DiagnosticRecord } from '@votingworks/types';
import { ComputerSection } from './computer_section';
import { CentralScannerSection } from './central_scanner_section';
import { makeTheme } from '../themes/make_theme';
import { PrintedReport } from '../reports/layout';
import { ReadinessReportHeader } from './report_header';

interface ReportContentsProps {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
  isScannerAttached: boolean;
  mostRecentScannerDiagnostic?: DiagnosticRecord;
}

export function CentralScanReadinessReportContents({
  batteryInfo,
  diskSpaceSummary,
  isScannerAttached,
  mostRecentScannerDiagnostic,
}: ReportContentsProps): JSX.Element {
  return (
    <div>
      <ComputerSection
        batteryInfo={batteryInfo}
        diskSpaceSummary={diskSpaceSummary}
      />
      <CentralScannerSection
        isScannerAttached={isScannerAttached}
        mostRecentScannerDiagnostic={mostRecentScannerDiagnostic}
      />
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

import { ThemeProvider } from 'styled-components';
import { ComputerSection, ComputerSectionProps } from './computer_section';
import {
  CentralScannerSection,
  CentralScannerSectionProps,
} from './central_scanner_section';
import { makeTheme } from '../themes/make_theme';
import { PrintedReport } from '../reports/layout';
import { ReadinessReportHeader } from './report_header';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
} from './configuration_section';

type ReportContentsProps = ComputerSectionProps &
  CentralScannerSectionProps &
  ConfigurationSectionProps;

export function CentralScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <div>
      <ConfigurationSection {...props} />
      <ComputerSection {...props} />
      <CentralScannerSection {...props} />
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

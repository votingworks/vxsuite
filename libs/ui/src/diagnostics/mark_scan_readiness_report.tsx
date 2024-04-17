import { ThemeProvider } from 'styled-components';
import { ComputerSection, ComputerSectionProps } from './computer_section';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
} from './configuration_section';
import {
  MarkScanControllerSection,
  MarkScanControllerSectionProps,
} from './mark_scan_controller_section';
import { makeTheme } from '../themes/make_theme';
import { PrintedReport } from '../reports/layout';
import { ReadinessReportHeader } from './report_header';

type ReportContentsProps = ComputerSectionProps &
  MarkScanControllerSectionProps &
  ConfigurationSectionProps;

export function MarkScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <div>
      <ConfigurationSection {...props} expectPrecinctSelection />
      <ComputerSection {...props} />
      <MarkScanControllerSection {...props} />
    </div>
  );
}

export function MarkScanReadinessReport({
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
          machineType="VxMarkScan"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <MarkScanReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}

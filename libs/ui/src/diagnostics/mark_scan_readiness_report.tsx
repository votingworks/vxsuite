import { ThemeProvider } from 'styled-components';
import { ComputerSection, ComputerSectionProps } from './computer_section';
import {
  ConfigurationSection,
  ConfigurationSectionProps,
} from './configuration_section';
import { makeTheme } from '../themes/make_theme';
import { PrintedReport } from '../reports/layout';
import { ReadinessReportHeader } from './report_header';
import {
  MarkScanDeviceDiagnosticSection,
  MarkScanDeviceDiagnosticSectionProps,
} from './mark_scan_device_diagnostic_section';
import { ReportContents } from './components';
import { DiagnosticSectionTitle } from './types';

type NonpresentationalSectionProps = Omit<
  MarkScanDeviceDiagnosticSectionProps,
  'diagnosticType' | 'title'
>;

type ReportContentsProps = ConfigurationSectionProps &
  ComputerSectionProps & {
    accessibleControllerProps: NonpresentationalSectionProps;
    paperHandlerProps: NonpresentationalSectionProps;
  };

export function MarkScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const { accessibleControllerProps, paperHandlerProps } = props;
  return (
    <ReportContents>
      <ConfigurationSection {...props} expectPrecinctSelection />
      <ComputerSection {...props} />
      <MarkScanDeviceDiagnosticSection
        {...accessibleControllerProps}
        diagnosticType="mark-scan-accessible-controller"
        title={DiagnosticSectionTitle.AccessibleController}
      />
      <MarkScanDeviceDiagnosticSection
        {...paperHandlerProps}
        diagnosticType="mark-scan-paper-handler"
        title={DiagnosticSectionTitle.PaperHandler}
      />
    </ReportContents>
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

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

type NonpresentationalSectionProps = Omit<
  MarkScanDeviceDiagnosticSectionProps,
  'diagnosticType' | 'title'
>;

type ReportContentsProps = ConfigurationSectionProps &
  ComputerSectionProps & {
    accessibleControllerProps: NonpresentationalSectionProps;
  };

export function MarkScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const { accessibleControllerProps } = props;
  return (
    <div>
      <ConfigurationSection {...props} expectPrecinctSelection />
      <ComputerSection {...props} />
      <MarkScanDeviceDiagnosticSection
        {...accessibleControllerProps}
        diagnosticType="mark-scan-accessible-controller"
        title="Accessible Controller"
      />
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

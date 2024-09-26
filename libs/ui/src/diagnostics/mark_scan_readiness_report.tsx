import { ThemeProvider } from 'styled-components';
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
import { StorageSection, StorageSectionProps } from './storage_section';

type NonpresentationalSectionProps = Omit<
  MarkScanDeviceDiagnosticSectionProps,
  'diagnosticType' | 'title'
>;

type HeadphoneInputSectionProps = Omit<
  NonpresentationalSectionProps,
  'isDeviceConnected'
>;

type ReportContentsProps = ConfigurationSectionProps &
  StorageSectionProps & {
    accessibleControllerProps: NonpresentationalSectionProps;
    paperHandlerProps: NonpresentationalSectionProps;
    patInputProps: NonpresentationalSectionProps;
    headphoneInputProps: HeadphoneInputSectionProps;
  };

export function MarkScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const {
    accessibleControllerProps,
    headphoneInputProps,
    paperHandlerProps,
    patInputProps,
  } = props;
  return (
    <ReportContents>
      <ConfigurationSection {...props} expectPrecinctSelection />
      <StorageSection {...props} />
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
      <MarkScanDeviceDiagnosticSection
        {...patInputProps}
        diagnosticType="mark-scan-pat-input"
        title={DiagnosticSectionTitle.PatInput}
        connectedText="Available"
        notConnectedText="Not available"
      />
      <MarkScanDeviceDiagnosticSection
        {...headphoneInputProps}
        diagnosticType="mark-scan-headphone-input"
        title={DiagnosticSectionTitle.HeadphoneInput}
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
          reportType="VxMark"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <MarkScanReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}

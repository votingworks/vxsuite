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
import {
  UninterruptiblePowerSupplySection,
  UpsSectionProps,
} from './uninterruptible_power_supply_section';
import { PrinterSection, PrinterSectionProps } from './printer_section';

type NonpresentationalSectionProps = Omit<
  MarkScanDeviceDiagnosticSectionProps,
  'diagnosticType' | 'title'
>;

type AudioDeviceInputProps = Omit<
  NonpresentationalSectionProps,
  'isDeviceConnected'
>;

interface ReportContentsProps
  extends ConfigurationSectionProps,
    StorageSectionProps,
    PrinterSectionProps,
    UpsSectionProps {
  accessibleControllerProps: NonpresentationalSectionProps;
  patInputProps: NonpresentationalSectionProps;
  barcodeReaderProps: NonpresentationalSectionProps;
  headphoneInputProps: AudioDeviceInputProps;
  systemAudioProps: AudioDeviceInputProps;
}

export function MarkReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const {
    accessibleControllerProps,
    patInputProps,
    barcodeReaderProps,
    headphoneInputProps,
    systemAudioProps,
  } = props;
  return (
    <ReportContents>
      <ConfigurationSection {...props} />
      <StorageSection {...props} />
      <PrinterSection {...props} />
      <MarkScanDeviceDiagnosticSection
        {...accessibleControllerProps}
        diagnosticType="mark-accessible-controller"
        title={DiagnosticSectionTitle.AccessibleController}
      />
      <MarkScanDeviceDiagnosticSection
        {...patInputProps}
        diagnosticType="mark-pat-input"
        title={DiagnosticSectionTitle.PatInput}
        connectedText="Available"
        notConnectedText="Not available"
      />
      <MarkScanDeviceDiagnosticSection
        {...barcodeReaderProps}
        diagnosticType="mark-barcode-reader"
        title={DiagnosticSectionTitle.BarcodeReader}
      />
      <MarkScanDeviceDiagnosticSection
        {...headphoneInputProps}
        diagnosticType="mark-headphone-input"
        title={DiagnosticSectionTitle.HeadphoneInput}
      />
      <MarkScanDeviceDiagnosticSection
        {...systemAudioProps}
        diagnosticType="mark-system-audio"
        title={DiagnosticSectionTitle.SystemAudio}
      />
      <UninterruptiblePowerSupplySection {...props} />
    </ReportContents>
  );
}

export function MarkReadinessReport({
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
        <MarkReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}

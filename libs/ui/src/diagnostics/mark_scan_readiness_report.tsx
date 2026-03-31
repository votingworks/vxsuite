import { ThemeProvider } from 'styled-components';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  ConfigurationSection,
  ConfigurationSectionProps,
  PollingPlaceSection,
  PollingPlaceSectionProps,
  PrecinctSelectionSection,
  PrecinctSelectionSectionProps,
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

type UpsSectionProps = Omit<NonpresentationalSectionProps, 'isDeviceConnected'>;

type ReportContentsProps = ConfigurationSectionProps &
  PrecinctSelectionSectionProps &
  PollingPlaceSectionProps &
  StorageSectionProps & {
    accessibleControllerProps: NonpresentationalSectionProps;
    paperHandlerProps: NonpresentationalSectionProps;
    patInputProps: NonpresentationalSectionProps;
    headphoneInputProps: HeadphoneInputSectionProps;
    upsProps: UpsSectionProps;
  };

export function MarkScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const { ENABLE_POLLING_PLACES } = BooleanEnvironmentVariableName;
  const {
    accessibleControllerProps,
    electionDefinition,
    headphoneInputProps,
    paperHandlerProps,
    patInputProps,
    pollingPlaceId,
    precinctSelection,
    upsProps,
  } = props;
  const election = electionDefinition?.election;

  return (
    <ReportContents>
      <ConfigurationSection {...props}>
        {isFeatureFlagEnabled(ENABLE_POLLING_PLACES) ? (
          <PollingPlaceSection
            election={election}
            pollingPlaceId={pollingPlaceId}
          />
        ) : (
          <PrecinctSelectionSection
            election={election}
            precinctSelection={precinctSelection}
          />
        )}
      </ConfigurationSection>
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
        title={DiagnosticSectionTitle.FrontHeadphoneInput}
      />
      <MarkScanDeviceDiagnosticSection
        {...upsProps}
        diagnosticType="uninterruptible-power-supply"
        title={DiagnosticSectionTitle.Ups}
        connectedText="Fully charged"
        notConnectedText="Not fully charged"
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
          reportType="VxMarkScan"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <MarkScanReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}

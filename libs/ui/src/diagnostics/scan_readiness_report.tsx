import { ThemeProvider } from 'styled-components';
import { makeTheme } from '../themes/make_theme.js';
import { PrintedReport } from '../reports/layout.js';
import { ReadinessReportHeader } from './report_header.js';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
} from './configuration_section.js';
import { ReportContents } from './components.js';
import {
  ThermalPrinterSection,
  ThermalPrinterSectionProps,
} from './thermal_printer_section.js';
import { StorageSection, StorageSectionProps } from './storage_section.js';
import { ScanAudioSection, ScanAudioSectionProps } from './scan_audio_section.js';
import {
  PrecinctScannerSection,
  PrecinctScannerSectionProps,
} from './precinct_scanner_section.js';
import {
  UninterruptiblePowerSupplySection,
  UpsSectionProps,
} from './uninterruptible_power_supply_section.js';

type ReportContentsProps = ConfigurationSectionProps &
  StorageSectionProps &
  PrecinctScannerSectionProps &
  ThermalPrinterSectionProps &
  ScanAudioSectionProps &
  UpsSectionProps;

export function ScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <ReportContents>
      <ConfigurationSection {...props} />
      <StorageSection {...props} />
      <PrecinctScannerSection {...props} />
      <ThermalPrinterSection {...props} />
      <ScanAudioSection {...props} />
      <UninterruptiblePowerSupplySection {...props} />
    </ReportContents>
  );
}

export function ScanReadinessReport({
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
          reportType="VxScan"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <ScanReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}

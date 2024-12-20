import { ThemeProvider } from 'styled-components';
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
import { ReportContents } from './components';
import { BatterySection, BatterySectionProps } from './battery_section';
import { StorageSection, StorageSectionProps } from './storage_section';

type ReportContentsProps = ConfigurationSectionProps &
  BatterySectionProps &
  StorageSectionProps &
  CentralScannerSectionProps;

export function CentralScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <ReportContents>
      <ConfigurationSection {...props} />
      <BatterySection {...props} />
      <StorageSection {...props} />
      <CentralScannerSection {...props} />
    </ReportContents>
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
          reportType="VxCentralScan"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <CentralScanReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}

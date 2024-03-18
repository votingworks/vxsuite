import { ComputerSection, ComputerSectionProps } from './computer_section';
import {
  MarkScanControllerSection,
  MarkScanControllerSectionProps,
} from './mark_scan_controller_section';

type ReportContentsProps = ComputerSectionProps &
  MarkScanControllerSectionProps;

export function MarkScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <div>
      <ComputerSection {...props} />
      <MarkScanControllerSection {...props} />
    </div>
  );
}

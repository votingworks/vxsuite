import {
  Button,
  Loading,
  P,
  ScanReadinessReportContents,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { Screen } from '../components/layout';
import {
  getConfig,
  getDiskSpaceSummary,
  getMostRecentPrinterDiagnostic,
  getPrinterStatus,
} from '../api';
import { PrintTestPageButton } from '../components/printer_management/print_test_page_button';
import { ElectionManagerLoadPaperButton } from '../components/printer_management/election_manager_load_paper_button';

export function DiagnosticsScreen({
  onClose,
}: {
  onClose: VoidFunction;
}): JSX.Element {
  const configQuery = getConfig.useQuery();
  const diskSpaceQuery = getDiskSpaceSummary.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const mostRecentPrinterDiagnosticQuery =
    getMostRecentPrinterDiagnostic.useQuery();

  if (
    !configQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !mostRecentPrinterDiagnosticQuery.isSuccess
  ) {
    return (
      <Screen title="System Diagnostics" voterFacing={false} padded>
        <Loading />
      </Screen>
    );
  }

  const printerStatus = printerStatusQuery.data;
  assert(printerStatus.scheme === 'hardware-v4');

  const { electionDefinition, precinctSelection } = configQuery.data;
  return (
    <Screen title="System Diagnostics" voterFacing={false} padded>
      <P>
        <Button icon="Previous" variant="primary" onPress={onClose}>
          Back
        </Button>{' '}
      </P>
      <ScanReadinessReportContents
        electionDefinition={electionDefinition}
        expectPrecinctSelection
        precinctSelection={precinctSelection}
        diskSpaceSummary={diskSpaceQuery.data}
        printerActionChildren={
          <P>
            <ElectionManagerLoadPaperButton isPrimary={false} />{' '}
            <PrintTestPageButton />
          </P>
        }
        printerStatus={printerStatus}
        mostRecentPrinterDiagnostic={
          mostRecentPrinterDiagnosticQuery.data ?? undefined
        }
      />
    </Screen>
  );
}

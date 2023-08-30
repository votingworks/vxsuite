import { Tabulation } from '@votingworks/types';
import { Button, Caption, Font, H2, Icons } from '@votingworks/ui';
import React, { useContext, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { Optional, assert } from '@votingworks/basics';
import {
  combineGroupSpecifierAndFilter,
  generateTitleForReport,
  isElectionManagerAuth,
} from '@votingworks/utils';
import { getResultsForTallyReports } from '../api';
import { AppContext } from '../contexts/app_context';
import { AdminTallyReportByParty } from './admin_tally_report_by_party';

const ExportActions = styled.div`
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  display: flex;
  justify-content: start;
  gap: 1rem;
`;

const PreviewContainer = styled.div`
  position: relative;
  min-height: 11in;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 10%);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const PreviewOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: black;
  opacity: 0.3;
`;

const Preview = styled.div`
  section {
    background: white;
    position: relative;
    box-shadow: 0 3px 10px rgb(0, 0, 0, 20%);
    margin-top: 1rem;
    margin-bottom: 2rem;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }
`;

const LoadingTextContainer = styled.div`
  background: white;
  padding: 1rem 1rem 0.5rem;
  border-radius: 0.5rem;
  border: solid black ${(p) => p.theme.sizes.bordersRem.thin}rem;
`;

const PreviewActionContainer = styled.div`
  position: absolute;
  inset: 0;
  margin-left: auto;
  margin-right: auto;
  margin-top: 4rem;
  display: flex;
  justify-content: center;
  align-items: start;
  z-index: 2;
`;

export interface TallyReportViewerProps {
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
  enabled: boolean;
  autoPreview: boolean;
}

export function TallyReportViewer({
  filter,
  groupBy,
  enabled,
  autoPreview,
}: TallyReportViewerProps): JSX.Element {
  const { electionDefinition, isOfficialResults, auth, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  const printedReportResultsQuery = getResultsForTallyReports.useQuery(
    {
      filter,
      groupBy,
    },
    { enabled: enabled && autoPreview }
  );

  const printedReportRef = useRef<Optional<JSX.Element>>();
  const printedReport: Optional<JSX.Element> = useMemo(() => {
    if (!enabled) {
      return undefined;
    }

    if (!printedReportResultsQuery.isSuccess) {
      return printedReportRef.current;
    }

    const allReports: JSX.Element[] = [];

    for (const tallyReportResults of printedReportResultsQuery.data) {
      const reportFilter = combineGroupSpecifierAndFilter(
        tallyReportResults,
        filter
      );
      const titleGeneration = generateTitleForReport({
        reportFilter,
        electionDefinition,
      });
      const title = titleGeneration.isOk()
        ? titleGeneration.ok()
        : 'Custom Filter Tally Report';
      const displayedFilter = !titleGeneration.isOk()
        ? reportFilter
        : undefined;
      allReports.push(
        <AdminTallyReportByParty
          electionDefinition={electionDefinition}
          testId="tally-report"
          title={title}
          tallyReportResults={tallyReportResults}
          tallyReportType={isOfficialResults ? 'Official' : 'Unofficial'}
          generatedAtTime={new Date(printedReportResultsQuery.dataUpdatedAt)}
          customFilter={displayedFilter}
        />
      );
    }

    return <React.Fragment>{allReports}</React.Fragment>;
  }, [
    enabled,
    printedReportResultsQuery.isSuccess,
    printedReportResultsQuery.data,
    printedReportResultsQuery.dataUpdatedAt,
    filter,
    electionDefinition,
    isOfficialResults,
  ]);
  printedReportRef.current = printedReport;

  async function refreshPreview() {
    return printedReportResultsQuery.refetch();
  }

  const isReportStale = printedReportResultsQuery.status === 'loading';

  return (
    <React.Fragment>
      <ExportActions>
        <Button
          onPress={() => {
            /* noop */
          }}
          variant="primary"
          disabled={!enabled}
        >
          Print Report
        </Button>
        <Button
          onPress={() => {
            /* noop */
          }}
          disabled={!enabled}
        >
          Export Report PDF
        </Button>
        <Button
          onPress={() => {
            /* noop */
          }}
          disabled={!enabled}
        >
          Export Report CSV
        </Button>
      </ExportActions>
      {enabled && (
        <React.Fragment>
          {' '}
          <Caption>
            <Icons.Info /> <Font weight="bold">Note:</Font> Printed reports may
            be paginated to more than one piece of paper.
          </Caption>
          <PreviewContainer>
            {printedReport && <Preview>{printedReport}</Preview>}
            {printedReport && isReportStale && (
              <React.Fragment>
                <PreviewOverlay />
                <PreviewActionContainer>
                  <Button onPress={refreshPreview} variant="regular">
                    <Icons.RotateRight /> Refresh Preview
                  </Button>
                </PreviewActionContainer>
              </React.Fragment>
            )}
            {!printedReport && (
              <PreviewActionContainer>
                <Button onPress={refreshPreview} variant="regular">
                  Load Preview
                </Button>
              </PreviewActionContainer>
            )}
            {printedReportResultsQuery.isFetching ? (
              <PreviewActionContainer>
                <LoadingTextContainer>
                  <H2>
                    <Icons.Loading /> Generating Report
                  </H2>
                </LoadingTextContainer>
              </PreviewActionContainer>
            ) : null}
          </PreviewContainer>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

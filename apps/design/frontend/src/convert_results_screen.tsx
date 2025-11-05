import { useParams } from 'react-router-dom';
import {
  Button,
  Callout,
  Caption,
  FileInputButton,
  H1,
  LoadingButton,
  MainContent,
  P,
} from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { ElectionIdParams, routes } from './routes';
import { useTitle } from './hooks/use_title';
import { ElectionNavScreen, Header } from './nav_screen';
import { convertMsResults } from './api';
import { Column } from './layout';

export function ConvertResultsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  useTitle(routes.election(electionId).convertResults.title);

  const convertMsResultsMutation = convertMsResults.useMutation();

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Convert Results</H1>
      </Header>
      <MainContent>
        <P>
          1. In VxAdmin, export the <strong>All Precincts Tally Report</strong>{' '}
          using the <strong>Export Report CSV</strong> button.
          <br />
          2. Upload the tally report CSV file below to convert it to SEMS
          format.
        </P>
        {convertMsResultsMutation.isLoading ? (
          <LoadingButton variant="primary">Converting Results…</LoadingButton>
        ) : (
          <FileInputButton
            buttonProps={{
              variant: convertMsResultsMutation.isSuccess
                ? 'neutral'
                : 'primary',
            }}
            accept=".csv"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              const fileContents = await file.text();
              convertMsResultsMutation.mutate({
                electionId,
                allPrecinctsTallyReportContents: fileContents,
              });
            }}
          >
            Upload Tally Report CSV
          </FileInputButton>
        )}
        {convertMsResultsMutation.isSuccess && (
          <div style={{ marginTop: '1rem', width: 'fit-content' }}>
            {convertMsResultsMutation.data.isOk() ? (
              <Callout color="primary" icon="Done">
                <div>
                  <div>
                    <strong>Results Converted</strong>
                  </div>
                  <br />
                  <Button
                    icon="Export"
                    variant="primary"
                    onPress={() => {
                      const { convertedResults, ballotHash } = assertDefined(
                        convertMsResultsMutation.data.ok()
                      );
                      fileDownload(
                        convertedResults,
                        `sems-results-${ballotHash}.txt`
                      );
                    }}
                  >
                    Download SEMS Results File
                  </Button>
                </div>
              </Callout>
            ) : (
              <Callout color="danger" icon="Danger">
                <Column style={{ gap: '0.5rem' }}>
                  <strong>Error Converting Results</strong>
                  {(() => {
                    const error = convertMsResultsMutation.data.err();
                    if (error instanceof Error) {
                      return error.message.split('\n').map((line, index) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <div key={index}>
                          <Caption>{line}</Caption>
                        </div>
                      ));
                    }
                    switch (error) {
                      case 'no-election-export-found':
                        return 'Election must be exported before converting results.';
                      case 'election-out-of-date':
                        return 'Election is out of date.';
                      case 'invalid-headers':
                        return 'Invalid CSV headers. Make sure you are uploading the All Precincts Tally Report exported from VxAdmin.';
                      case 'report-precincts-mismatch':
                        return 'This report contains different precincts than this election.';
                      case 'report-contests-mismatch':
                        return 'This report contains different contests than this election.';
                      default: {
                        /* istanbul ignore next - @preserve */
                        throwIllegalValue(error);
                      }
                    }
                  })()}
                </Column>
              </Callout>
            )}
          </div>
        )}
      </MainContent>
    </ElectionNavScreen>
  );
}

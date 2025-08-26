import React, { FormEvent, useState } from 'react';
import {
  H1,
  P,
  Button,
  MainContent,
  useQueryChangeListener,
  LoadingButton,
  Icons,
  CheckboxButton,
  SearchSelect,
  H2,
  SegmentedButton,
  FileInputButton,
  Callout,
} from '@votingworks/ui';
import { Buffer } from 'node:buffer';
import { Link, useParams } from 'react-router-dom';
import { ElectionSerializationFormat } from '@votingworks/types';
import { assertDefined, assert } from '@votingworks/basics';
import type { BallotTemplateId } from '@votingworks/design-backend';
import { format } from '@votingworks/utils';
import {
  exportElectionPackage,
  exportTestDecks,
  getBallotsFinalizedAt,
  getElectionPackage,
  finalizeBallots,
  setBallotTemplate,
  unfinalizeBallots,
  getUserFeatures,
  getTestDecks,
  getBallotTemplate,
  decryptCvrBallotAuditIds,
  getElectionInfo,
} from './api';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import { downloadFile } from './utils';
import { Column, FieldName, InputGroup, Row } from './layout';
import { useTitle } from './hooks/use_title';

const ballotTemplateOptions = {
  VxDefaultBallot: 'VotingWorks Default Ballot',
  NhBallot: 'New Hampshire Ballot',
} satisfies Record<BallotTemplateId, string>;

function parseExportError(error: string): string {
  // Try to parse as JSON first, in case it's a stringified BallotLayoutError
  try {
    const parsedError = JSON.parse(error);
    if (
      typeof parsedError === 'object' &&
      parsedError !== null &&
      'error' in parsedError
    ) {
      const errorObj = parsedError as {
        error: string;
        field?: string;
        contest?: { title: string };
      };

      if (errorObj.error === 'missingRequiredField' && errorObj.field) {
        assert(errorObj.field === 'signature');
        return 'A signature is required for this ballot. Please add a signature in the Election Info section before exporting.';
      } if (errorObj.error === 'contestTooLong') {
        return `Contest "${
          assertDefined(errorObj.contest).title
        }" was too long to fit on the page. Try a longer paper size.`;
      }
    }
  } catch {
    // If JSON parsing fails, treat as a regular string error
  }
  return 'An unexpected error occurred. Please try again.';
}

export function ExportScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const [shouldExportAudio, setShouldExportAudio] = useState(false);
  useTitle(routes.election(electionId).export.title);
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const electionPackageQuery = getElectionPackage.useQuery(electionId);
  const exportElectionPackageMutation = exportElectionPackage.useMutation();
  const testDecksQuery = getTestDecks.useQuery(electionId);
  const exportTestDecksMutation = exportTestDecks.useMutation();
  const setBallotTemplateMutation = setBallotTemplate.useMutation();
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getBallotTemplateQuery = getBallotTemplate.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const finalizeBallotsMutation = finalizeBallots.useMutation();
  const unfinalizeBallotsMutation = unfinalizeBallots.useMutation();
  const decryptCvrBallotAuditIdsMutation =
    decryptCvrBallotAuditIds.useMutation();

  const [electionSerializationFormat, setElectionSerializationFormat] =
    useState<ElectionSerializationFormat>('vxf');
  const [numAuditIdBallots, setNumAuditIdBallots] = useState<number>();
  const [ballotAuditIdSecretKey, setBallotAuditIdSecretKey] =
    useState<string>();
  const [exportError, setExportError] = useState<string>();

  useQueryChangeListener(electionPackageQuery, {
    onChange: (currentElectionPackage, previousElectionPackage) => {
      const taskJustCompleted = Boolean(
        previousElectionPackage?.task &&
          !previousElectionPackage.task.completedAt &&
          currentElectionPackage.task?.completedAt
      );
      if (taskJustCompleted) {
        const { error } = assertDefined(currentElectionPackage.task);
        if (error) {
          setExportError(parseExportError(error));
        } else {
          downloadFile(assertDefined(currentElectionPackage.url));
        }
      }
    },
  });

  useQueryChangeListener(testDecksQuery, {
    onChange: (currentTestDecks, previousTestDecks) => {
      const taskJustCompleted = Boolean(
        previousTestDecks?.task &&
          !previousTestDecks.task.completedAt &&
          currentTestDecks.task?.completedAt
      );
      if (taskJustCompleted) {
        const { error } = assertDefined(currentTestDecks.task);
        if (error) {
          setExportError(parseExportError(error));
        } else {
          downloadFile(assertDefined(currentTestDecks.url));
        }
      }
    },
  });

  function onPressExportTestDecks() {
    setExportError(undefined);
    exportTestDecksMutation.mutate({ electionId, electionSerializationFormat });
  }

  function onPressExportElectionPackage() {
    setExportError(undefined);
    exportElectionPackageMutation.mutate({
      electionId,
      electionSerializationFormat,
      shouldExportAudio,
      numAuditIdBallots,
    });
  }

  if (
    !(
      electionPackageQuery.isSuccess &&
      testDecksQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess &&
      getBallotTemplateQuery.isSuccess &&
      getUserFeaturesQuery.isSuccess &&
      getElectionInfoQuery.isSuccess
    )
  ) {
    return null;
  }
  const electionPackage = electionPackageQuery.data;
  const isElectionPackageExportInProgress =
    exportElectionPackageMutation.isLoading ||
    (electionPackage.task && !electionPackage.task.completedAt);

  const testDecks = testDecksQuery.data;
  const isTestDecksExportInProgress =
    exportTestDecksMutation.isLoading ||
    (testDecks.task && !testDecks.task.completedAt);

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const ballotTemplateId = getBallotTemplateQuery.data;
  const features = getUserFeaturesQuery.data;
  const electionInfo = getElectionInfoQuery.data;

  async function onSelectCvrsToDecrypt(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    const file = files[0];
    const cvrZipFileContents = Buffer.from(await file.arrayBuffer());
    decryptCvrBallotAuditIdsMutation.mutate(
      {
        cvrZipFileContents,
        secretKey: assertDefined(ballotAuditIdSecretKey),
      },
      {
        onSuccess: (outputFileContents) => {
          downloadFile(
            URL.createObjectURL(
              new Blob([outputFileContents], { type: 'application/zip' })
            ),
            'decrypted-cvrs.zip'
          );
          setBallotAuditIdSecretKey(undefined);
        },
      }
    );
  }

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Export</H1>
      </Header>
      <MainContent>
        <H2>Ballots</H2>
        <Column style={{ gap: '1rem' }}>
          {features.CHOOSE_BALLOT_TEMPLATE && (
            <React.Fragment>
              <InputGroup label="Ballot Template">
                <SearchSelect
                  aria-label="Ballot Template"
                  value={ballotTemplateId}
                  options={Object.entries(ballotTemplateOptions).map(
                    ([value, label]) => ({ value, label })
                  )}
                  onChange={(value) => {
                    setBallotTemplateMutation.mutate({
                      electionId,
                      ballotTemplateId: value as BallotTemplateId,
                    });
                  }}
                  disabled={Boolean(ballotsFinalizedAt)}
                />
              </InputGroup>
              {ballotTemplateId === 'NhBallot' && !electionInfo.signature && (
                <Row
                  style={{
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <Callout color="danger" icon="Danger">
                    <span>
                      The election is missing the following required field:
                      &quot;signature&quot;. Update in{' '}
                      <Link to={routes.election(electionId).electionInfo.path}>
                        Election Info
                      </Link>
                      .
                    </span>
                  </Callout>
                </Row>
              )}
            </React.Fragment>
          )}
          <div>
            <FieldName>Proofing Status</FieldName>
            {ballotsFinalizedAt ? (
              <Column style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
                <div>
                  Ballots finalized at:{' '}
                  {format.localeShortDateAndTime(ballotsFinalizedAt)}
                </div>
                <Button
                  onPress={() => {
                    unfinalizeBallotsMutation.mutate({
                      electionId,
                    });
                  }}
                  disabled={finalizeBallotsMutation.isLoading}
                  variant="danger"
                  icon="Delete"
                >
                  Unfinalize Ballots
                </Button>
              </Column>
            ) : (
              <div>Ballots not finalized</div>
            )}
          </div>

          <div>
            <SegmentedButton
              label="Export Audio"
              selectedOptionId={shouldExportAudio ? 1 : 0}
              options={[
                { id: 1, label: 'On' },
                { id: 0, label: 'Off' },
              ]}
              onChange={(value) => setShouldExportAudio(value === 1)}
              disabled={isElectionPackageExportInProgress}
            />
          </div>
        </Column>

        <H2>Export</H2>
        {features.EXPORT_TEST_DECKS && (
          <P>
            {isTestDecksExportInProgress ? (
              <LoadingButton>Exporting Test Decks...</LoadingButton>
            ) : (
              <Button variant="primary" onPress={onPressExportTestDecks}>
                Export Test Decks
              </Button>
            )}
          </P>
        )}
        <P>
          {isElectionPackageExportInProgress ? (
            <LoadingButton>
              Exporting Election Package and Ballots...
            </LoadingButton>
          ) : (
            <Button onPress={onPressExportElectionPackage} variant="primary">
              Export Election Package and Ballots
            </Button>
          )}
        </P>
        {exportError && (
          <P>
            <Icons.Danger /> {exportError}
          </P>
        )}

        <P style={{ width: 'max-content' }}>
          <CheckboxButton
            label="Format election using CDF"
            isChecked={electionSerializationFormat === 'cdf'}
            onChange={(isChecked) =>
              setElectionSerializationFormat(isChecked ? 'cdf' : 'vxf')
            }
          />
        </P>
        <P>
          <CheckboxButton
            label="Generate audit IDs for ballots"
            isChecked={numAuditIdBallots !== undefined}
            onChange={(isChecked) =>
              setNumAuditIdBallots(isChecked ? 1 : undefined)
            }
          />
        </P>
        <InputGroup label="Number of Audit IDs to Generate">
          <input
            type="number"
            min={1}
            max={100}
            value={numAuditIdBallots ?? ''}
            onChange={(e) => setNumAuditIdBallots(e.target.valueAsNumber)}
            disabled={numAuditIdBallots === undefined}
          />
        </InputGroup>

        <H2>Decrypt CVR Ballot Audit IDs</H2>
        <InputGroup label="Secret Key">
          <input
            type="text"
            value={ballotAuditIdSecretKey ?? ''}
            onChange={(e) => setBallotAuditIdSecretKey(e.target.value)}
            disabled={decryptCvrBallotAuditIdsMutation.isLoading}
          />
        </InputGroup>
        <P style={{ marginTop: '0.5rem' }}>
          <FileInputButton
            accept=".zip"
            onChange={onSelectCvrsToDecrypt}
            disabled={
              !ballotAuditIdSecretKey ||
              decryptCvrBallotAuditIdsMutation.isLoading
            }
          >
            Select CVR Export Zip File
          </FileInputButton>
        </P>
      </MainContent>
    </ElectionNavScreen>
  );
}

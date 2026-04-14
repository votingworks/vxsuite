import React, { FormEvent, useState } from 'react';
import {
  H1,
  P,
  Button,
  MainContent,
  CheckboxButton,
  SearchSelect,
  H2,
  FileInputButton,
  Callout,
} from '@votingworks/ui';
import { Buffer } from 'node:buffer';
import { useParams } from 'react-router-dom';
import { ElectionSerializationFormat } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import type { BallotTemplateId } from '@votingworks/design-backend';
import {
  exportElectionPackage,
  exportTestDecks,
  getBallotsFinalizedAt,
  getElectionPackage,
  setBallotTemplate,
  getUserFeatures,
  getTestDecks,
  getBallotTemplate,
  decryptCvrBallotAuditIds,
  getStateFeatures,
} from './api';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import { downloadFile } from './utils';
import { Column, InputGroup } from './layout';
import { useTitle } from './hooks/use_title';
import { ReorderContestsByDistrictButton } from './reorder_contests_by_district_button';
import { Downloads } from './downloads';
import { ProofingStatus } from './proofing_status';
import { TaskProgress } from './task_progress';

const ballotTemplateOptions = {
  VxDefaultBallot: 'VotingWorks Default Ballot',
  NhBallot: 'New Hampshire Ballot',
  MsBallot: 'Mississippi Ballot',
  MiBallot: 'Michigan Ballot',
} satisfies Record<BallotTemplateId, string>;

export function ExportScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const [shouldExportAudio, setShouldExportAudio] = useState(false);
  const [shouldExportSampleBallots, setShouldExportSampleBallots] =
    useState(false);
  const [shouldExportTestBallots, setShouldExportTestBallots] = useState(false);
  useTitle(routes.election(electionId).export.title);
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const getStateFeaturesQuery = getStateFeatures.useQuery(electionId);
  const electionPackageQuery = getElectionPackage.useQuery(electionId);
  const exportElectionPackageMutation = exportElectionPackage.useMutation();
  const testDecksQuery = getTestDecks.useQuery(electionId);
  const exportTestDecksMutation = exportTestDecks.useMutation();
  const setBallotTemplateMutation = setBallotTemplate.useMutation();
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getBallotTemplateQuery = getBallotTemplate.useQuery(electionId);
  const decryptCvrBallotAuditIdsMutation =
    decryptCvrBallotAuditIds.useMutation();

  const [electionSerializationFormat, setElectionSerializationFormat] =
    useState<ElectionSerializationFormat>('vxf');
  const [numAuditIdBallots, setNumAuditIdBallots] = useState<number>();
  const [ballotAuditIdSecretKey, setBallotAuditIdSecretKey] =
    useState<string>();
  const [exportError, setExportError] = useState<string>();

  React.useEffect(() => {
    if (!getStateFeaturesQuery.data) return;

    const f = getStateFeaturesQuery.data;
    setShouldExportAudio(!!f.AUDIO_ENABLED);
    setShouldExportSampleBallots(!!f.EXPORT_SAMPLE_BALLOTS);
    setShouldExportTestBallots(!!f.EXPORT_TEST_BALLOTS);
  }, [getStateFeaturesQuery.data]);

  React.useEffect(() => {
    setExportError(
      electionPackageQuery.data?.task?.error || testDecksQuery.data?.task?.error
    );
  }, [electionPackageQuery.data, testDecksQuery.data]);

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
      shouldExportSampleBallots,
      shouldExportTestBallots,
      numAuditIdBallots,
    });
  }

  if (
    !(
      electionPackageQuery.isSuccess &&
      testDecksQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess &&
      getBallotTemplateQuery.isSuccess &&
      getStateFeaturesQuery.isSuccess &&
      getUserFeaturesQuery.isSuccess
    )
  ) {
    return null;
  }
  const electionPackage = electionPackageQuery.data;
  const testDecks = testDecksQuery.data;

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const ballotTemplateId = getBallotTemplateQuery.data;
  const features = getUserFeaturesQuery.data;
  const stateFeatures = getStateFeaturesQuery.data;

  const canExportTestDecks =
    features.EXPORT_TEST_DECKS && stateFeatures.EXPORT_TEST_BALLOTS;

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
              new Blob([new Uint8Array(outputFileContents)], {
                type: 'application/zip',
              })
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

      <MainContent
        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      >
        <Column style={{ gap: '1rem' }}>
          <H2 style={{ margin: 0 }}>Ballots</H2>
          {features.CHOOSE_BALLOT_TEMPLATE && (
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
          )}
          <ProofingStatus />
        </Column>

        <Column style={{ alignItems: 'flex-start', gap: '0.5rem' }}>
          <H2 style={{ margin: 0 }}>Contests</H2>
          <ReorderContestsByDistrictButton electionId={electionId} />
        </Column>

        {/* Prevent any further exports after finalizing ballots: */}
        {!ballotsFinalizedAt && (
          <Column
            style={{
              gap: '0.5rem',
              alignItems: 'flex-start',
              maxWidth: '30rem',
            }}
          >
            <H2 style={{ margin: 0 }}>Export</H2>
            {canExportTestDecks &&
              (testDecks.task && !testDecks.task.completedAt ? (
                <TaskProgress
                  style={{ alignSelf: 'stretch' }}
                  title="Exporting Test Decks"
                  task={testDecks.task}
                />
              ) : (
                <Button
                  variant="primary"
                  onPress={onPressExportTestDecks}
                  disabled={exportTestDecksMutation.isLoading}
                >
                  Export Test Decks
                </Button>
              ))}
            {electionPackage.task && !electionPackage.task.completedAt ? (
              <TaskProgress
                style={{ alignSelf: 'stretch' }}
                title="Exporting Election Package and Ballots"
                task={electionPackage.task}
              />
            ) : (
              <Button
                onPress={onPressExportElectionPackage}
                variant="primary"
                disabled={exportElectionPackageMutation.isLoading}
              >
                Export Election Package and Ballots
              </Button>
            )}
            {exportError && (
              <Callout
                color="danger"
                icon="Danger"
                style={{ margin: '0.5rem 0' }}
              >
                An unexpected error occurred while exporting. Please try again.
              </Callout>
            )}

            <CheckboxButton
              label="Include audio"
              isChecked={shouldExportAudio}
              onChange={(isChecked) => setShouldExportAudio(isChecked)}
            />

            <CheckboxButton
              label="Include sample ballots"
              isChecked={shouldExportSampleBallots}
              onChange={(isChecked) => setShouldExportSampleBallots(isChecked)}
            />

            <CheckboxButton
              label="Include test ballots"
              isChecked={shouldExportTestBallots}
              onChange={(isChecked) => setShouldExportTestBallots(isChecked)}
            />

            <CheckboxButton
              label="Format election using CDF"
              isChecked={electionSerializationFormat === 'cdf'}
              onChange={(isChecked) =>
                setElectionSerializationFormat(isChecked ? 'cdf' : 'vxf')
              }
            />

            <CheckboxButton
              label="Generate audit IDs for ballots"
              isChecked={numAuditIdBallots !== undefined}
              onChange={(isChecked) =>
                setNumAuditIdBallots(isChecked ? 1 : undefined)
              }
            />

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
          </Column>
        )}

        <Downloads />

        <div>
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
        </div>
      </MainContent>
    </ElectionNavScreen>
  );
}

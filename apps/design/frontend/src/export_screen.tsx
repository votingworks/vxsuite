import { FormEvent, useState } from 'react';
import {
  H1,
  P,
  Button,
  MainContent,
  useQueryChangeListener,
  CheckboxButton,
  SearchSelect,
  H2,
  FileInputButton,
  Callout,
  Card,
  H4,
  ProgressBar,
} from '@votingworks/ui';
import { Buffer } from 'node:buffer';
import { useParams } from 'react-router-dom';
import { ElectionSerializationFormat } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import type {
  BallotTemplateId,
  BackgroundTask,
} from '@votingworks/design-backend';
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
} from './api';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import { downloadFile } from './utils';
import { Column, FieldName, InputGroup } from './layout';
import { useTitle } from './hooks/use_title';

function TaskProgressCard({
  title,
  task,
  style,
}: {
  title: string;
  task: BackgroundTask;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <Card color="primary" style={style}>
      <H4>{title}</H4>
      <P>{task.progress?.label ?? 'Starting'}</P>
      <ProgressBar
        // Recreate progress bar for each phase so that it doesn't animate backwards
        key={task.progress?.label}
        progress={
          task.progress ? task.progress.progress / task.progress.total : 0
        }
      />
    </Card>
  );
}

const ballotTemplateOptions = {
  VxDefaultBallot: 'VotingWorks Default Ballot',
  NhBallot: 'New Hampshire Ballot',
  MsBallot: 'Mississippi Ballot',
} satisfies Record<BallotTemplateId, string>;

export function ExportScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const [shouldExportAudio, setShouldExportAudio] = useState(false);
  const [shouldExportSampleBallots, setShouldExportSampleBallots] =
    useState(false);
  useTitle(routes.election(electionId).export.title);
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const electionPackageQuery = getElectionPackage.useQuery(electionId);
  const exportElectionPackageMutation = exportElectionPackage.useMutation();
  const testDecksQuery = getTestDecks.useQuery(electionId);
  const exportTestDecksMutation = exportTestDecks.useMutation();
  const setBallotTemplateMutation = setBallotTemplate.useMutation();
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getBallotTemplateQuery = getBallotTemplate.useQuery(electionId);
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
          setExportError(error);
        } else {
          // [TODO] Replace automatic download with download cards for separate
          // election package/ballot archives.
          downloadFile(
            assertDefined(currentElectionPackage.electionPackageUrl)
          );
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
          setExportError(error);
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
      shouldExportSampleBallots,
      numAuditIdBallots,
    });
  }

  if (
    !(
      electionPackageQuery.isSuccess &&
      testDecksQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess &&
      getBallotTemplateQuery.isSuccess &&
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
        </Column>

        <H2>Export</H2>
        <Column
          style={{ gap: '0.5rem', alignItems: 'flex-start', maxWidth: '30rem' }}
        >
          {features.EXPORT_TEST_DECKS &&
            (testDecks.task && !testDecks.task.completedAt ? (
              <TaskProgressCard
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
            <TaskProgressCard
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

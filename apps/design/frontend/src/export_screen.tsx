import { FormEvent, useState } from 'react';
import {
  H1,
  P,
  Button,
  MainContent,
  useQueryChangeListener,
  LoadingButton,
  CheckboxButton,
  SearchSelect,
  H2,
  SegmentedButton,
  FileInputButton,
  Callout,
} from '@votingworks/ui';
import { Buffer } from 'node:buffer';
import { useParams } from 'react-router-dom';
import { ElectionSerializationFormat } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
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
} from './api';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import { downloadFile } from './utils';
import { Column, FieldName, InputGroup } from './layout';
import { useTitle } from './hooks/use_title';

const ballotTemplateOptions = {
  VxDefaultBallot: 'VotingWorks Default Ballot',
  NhBallot: 'New Hampshire Ballot',
} satisfies Record<BallotTemplateId, string>;

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
          <Callout color="danger" icon="Danger" style={{ margin: '0.5rem 0' }}>
            An unexpected error occurred while exporting. Please try again.
          </Callout>
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

import { useState } from 'react';
import {
  H1,
  P,
  Button,
  MainContent,
  MainHeader,
  useQueryChangeListener,
  LoadingButton,
  Icons,
  CheckboxButton,
  SearchSelect,
  H2,
} from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import {
  ElectionSerializationFormat,
  formatBallotHash,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import type { BallotTemplateId } from '@votingworks/design-backend';
import { format } from '@votingworks/utils';
import {
  exportElectionPackage,
  exportTestDecks,
  getBallotsFinalizedAt,
  getElection,
  getElectionPackage,
  finalizeBallots,
  setBallotTemplate,
  updateBallotOrderInfo,
  unfinalizeBallots,
} from './api';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';
import { downloadFile } from './utils';
import { Column, FieldName, InputGroup } from './layout';

const ballotTemplateOptions = {
  VxDefaultBallot: 'VotingWorks Default Ballot',
  NhBallot: 'New Hampshire Ballot - V4',
  NhBallotCompact: '[Compact] New Hampshire Ballot - V4',
  NhBallotV3: 'New Hampshire Ballot - V3',
  NhBallotV3Compact: '[Compact] New Hampshire Ballot - V3',
} satisfies Record<BallotTemplateId, string>;

export function ExportScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  const electionPackageQuery = getElectionPackage.useQuery(electionId);
  const exportElectionPackageMutation = exportElectionPackage.useMutation();
  const exportTestDecksMutation = exportTestDecks.useMutation();
  const setBallotTemplateMutation = setBallotTemplate.useMutation();
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const finalizeBallotsMutation = finalizeBallots.useMutation();
  const unfinalizeBallotsMutation = unfinalizeBallots.useMutation();
  const updateBallotOrderInfoMutation = updateBallotOrderInfo.useMutation();

  const [electionSerializationFormat, setElectionSerializationFormat] =
    useState<ElectionSerializationFormat>('vxf');
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

  function onPressExportTestDecks() {
    setExportError(undefined);
    exportTestDecksMutation.mutate(
      { electionId, electionSerializationFormat },
      {
        onSuccess: ({ zipContents, ballotHash }) => {
          fileDownload(
            zipContents,
            `test-decks-${formatBallotHash(ballotHash)}.zip`
          );
        },
      }
    );
  }

  function onPressExportElectionPackage() {
    setExportError(undefined);
    exportElectionPackageMutation.mutate({
      electionId,
      electionSerializationFormat,
    });
  }

  if (
    !(
      getElectionQuery.isSuccess &&
      electionPackageQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess
    )
  ) {
    return null;
  }
  const electionPackage = electionPackageQuery.data;
  const isElectionPackageExportInProgress =
    exportElectionPackageMutation.isLoading ||
    (electionPackage.task && !electionPackage.task.completedAt);

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const { ballotOrderInfo, ballotTemplateId } = getElectionQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <MainHeader>
        <H1>Export</H1>
      </MainHeader>
      <MainContent>
        <H2>Ballots</H2>
        <Column style={{ gap: '1rem' }}>
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
            <FieldName>Order Status</FieldName>
            {ballotOrderInfo.orderSubmittedAt ? (
              <Column style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
                <div>
                  Order submitted at:{' '}
                  {format.localeShortDateAndTime(
                    new Date(ballotOrderInfo.orderSubmittedAt)
                  )}
                </div>
                <Button
                  onPress={() => {
                    updateBallotOrderInfoMutation.mutate({
                      electionId,
                      ballotOrderInfo: {
                        ...ballotOrderInfo,
                        orderSubmittedAt: undefined,
                      },
                    });
                  }}
                  disabled={updateBallotOrderInfoMutation.isLoading}
                  variant="danger"
                  icon="Delete"
                >
                  Unsubmit Order
                </Button>
              </Column>
            ) : (
              <div>Order not submitted</div>
            )}
          </div>
        </Column>

        <H2>Export</H2>
        <P>
          <Button
            variant="primary"
            onPress={onPressExportTestDecks}
            disabled={exportTestDecksMutation.isLoading}
          >
            Export Test Decks
          </Button>
        </P>
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
            <Icons.Danger /> An unexpected error occurred. Please try again.
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
      </MainContent>
    </ElectionNavScreen>
  );
}

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
} from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import {
  ElectionSerializationFormat,
  formatBallotHash,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import type { BallotTemplateId } from '@votingworks/design-backend';
import {
  exportAllBallots,
  exportElectionPackage,
  exportTestDecks,
  getElection,
  getElectionPackage,
  setBallotTemplate,
} from './api';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';
import { downloadFile } from './utils';
import { InputGroup } from './layout';

const ballotTemplateOptions = {
  VxDefaultBallot: 'VotingWorks Default Ballot',
  NhBallot: 'New Hampshire Ballot - V4',
  NhBallotV3: 'New Hampshire Ballot - V3',
} satisfies Record<BallotTemplateId, string>;

export function ExportScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  const electionPackageQuery = getElectionPackage.useQuery(electionId);
  const exportAllBallotsMutation = exportAllBallots.useMutation();
  const exportElectionPackageMutation = exportElectionPackage.useMutation();
  const exportTestDecksMutation = exportTestDecks.useMutation();
  const setBallotTemplateMutation = setBallotTemplate.useMutation();

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

  function onPressExportAllBallots() {
    setExportError(undefined);
    exportAllBallotsMutation.mutate(
      { electionId, electionSerializationFormat },
      {
        onSuccess: ({ zipContents, ballotHash }) => {
          fileDownload(
            zipContents,
            `ballots-${formatBallotHash(ballotHash)}.zip`
          );
        },
      }
    );
  }

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

  if (!electionPackageQuery.isSuccess) {
    return null;
  }
  const electionPackage = electionPackageQuery.data;
  const isElectionPackageExportInProgress =
    exportElectionPackageMutation.isLoading ||
    (electionPackage.task && !electionPackage.task.completedAt);

  return (
    <ElectionNavScreen electionId={electionId}>
      <MainHeader>
        <H1>Export</H1>
      </MainHeader>
      <MainContent>
        <P>
          <Button
            variant="primary"
            onPress={onPressExportAllBallots}
            disabled={exportAllBallotsMutation.isLoading}
          >
            Export All Ballots
          </Button>
        </P>
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
            <LoadingButton>Exporting Election Package...</LoadingButton>
          ) : (
            <Button onPress={onPressExportElectionPackage} variant="primary">
              Export Election Package
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

        <P>
          <InputGroup label="Ballot Template">
            <SearchSelect
              value={getElectionQuery.data?.ballotTemplateId}
              options={Object.entries(ballotTemplateOptions).map(
                ([value, label]) => ({ value, label })
              )}
              onChange={(value) => {
                setBallotTemplateMutation.mutate({
                  electionId,
                  ballotTemplateId: value as BallotTemplateId,
                });
              }}
            />
          </InputGroup>
        </P>
      </MainContent>
    </ElectionNavScreen>
  );
}

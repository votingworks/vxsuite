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
} from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import {
  ElectionSerializationFormat,
  getDisplayElectionHash,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import {
  exportAllBallots,
  exportElectionPackage,
  exportTestDecks,
  getElectionPackage,
} from './api';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';
import { downloadFile } from './utils';

export function ExportScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();

  const electionPackageQuery = getElectionPackage.useQuery(electionId);
  const exportAllBallotsMutation = exportAllBallots.useMutation();
  const exportElectionPackageMutation = exportElectionPackage.useMutation();
  const exportTestDecksMutation = exportTestDecks.useMutation();

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
        onSuccess: ({ zipContents, electionHash }) => {
          fileDownload(
            zipContents,
            `ballots-${getDisplayElectionHash({ electionHash })}.zip`
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
        onSuccess: ({ zipContents, electionHash }) => {
          fileDownload(
            zipContents,
            `test-decks-${getDisplayElectionHash({ electionHash })}.zip`
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
      </MainContent>
    </ElectionNavScreen>
  );
}

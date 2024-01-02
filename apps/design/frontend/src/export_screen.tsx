import { H1, P, Button, MainContent, MainHeader } from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import { getDisplayElectionHash } from '@votingworks/types';
import {
  exportAllBallots,
  exportElectionPackage,
  exportTestDecks,
} from './api';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';

export function ExportScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const exportAllBallotsMutation = exportAllBallots.useMutation();
  const exportTestDecksMutation = exportTestDecks.useMutation();
  const exportElectionPackageMutation = exportElectionPackage.useMutation();

  function onPressExportAllBallots() {
    exportAllBallotsMutation.mutate(
      { electionId },
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
    exportTestDecksMutation.mutate(
      { electionId },
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
    exportElectionPackageMutation.mutate(
      { electionId },
      {
        onSuccess: ({ zipContents, electionHash }) => {
          fileDownload(
            zipContents,
            `election-package-${getDisplayElectionHash({ electionHash })}.zip`
          );
        },
      }
    );
  }

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
          <Button
            variant="primary"
            onPress={onPressExportElectionPackage}
            disabled={exportElectionPackageMutation.isLoading}
          >
            Export Election Package
          </Button>
        </P>
      </MainContent>
    </ElectionNavScreen>
  );
}

import { H1, P, Button, MainContent, MainHeader } from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import { getDisplayElectionHash } from '@votingworks/types';
import {
  exportAllBallots,
  exportElectionPackage,
  getElectionPackage,
} from './api';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';

export function ExportScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const exportAllBallotsMutation = exportAllBallots.useMutation();
  const exportElectionPackageMutation = exportElectionPackage.useMutation();
  const electionPackageQuery = getElectionPackage.useQuery(electionId);

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

  function onPressExportElectionPackage() {
    exportElectionPackageMutation.mutate({ electionId });
  }

  if (!electionPackageQuery.isSuccess) {
    return null;
  }
  const electionPackageFilePath = electionPackageQuery.data.filePath;
  const electionPackageTask = electionPackageQuery.data.task;

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
            onPress={onPressExportElectionPackage}
            disabled={
              exportElectionPackageMutation.isLoading ||
              electionPackageQuery.isLoading ||
              (electionPackageTask && !electionPackageTask.completedAt)
            }
          >
            Export Election Package
          </Button>{' '}
          {/* TODO: Implement a real UX to replace this proof-of-concept UX */}
          {electionPackageFilePath && (
            <a
              download={electionPackageFilePath}
              href={electionPackageFilePath}
            >
              {electionPackageFilePath}
            </a>
          )}
        </P>
      </MainContent>
    </ElectionNavScreen>
  );
}

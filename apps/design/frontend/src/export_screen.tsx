import { H1, P, Button } from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import { getDisplayElectionHash } from '@votingworks/types';
import { exportAllBallots, exportSetupPackage } from './api';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';

export function ExportScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const exportAllBallotsMutation = exportAllBallots.useMutation();
  const exportSetupPackageMutation = exportSetupPackage.useMutation();

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

  function onPressExportSetupPackage() {
    exportSetupPackageMutation.mutate(
      { electionId },
      {
        onSuccess: ({ zipContents, electionHash }) => {
          fileDownload(
            zipContents,
            `setup-package-${getDisplayElectionHash({ electionHash })}.zip`
          );
        },
      }
    );
  }

  return (
    <ElectionNavScreen electionId={electionId}>
      <H1>Export</H1>
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
          onPress={onPressExportSetupPackage}
          disabled={exportSetupPackageMutation.isLoading}
        >
          Export Setup Package
        </Button>
      </P>
    </ElectionNavScreen>
  );
}

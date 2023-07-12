import { H1, P, Button } from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { useParams } from 'react-router-dom';
import { exportAllBallots, exportBallotDefinition } from './api';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams } from './routes';

export function ExportScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const exportAllBallotsMutation = exportAllBallots.useMutation();
  const exportBallotDefinitionMutation = exportBallotDefinition.useMutation();

  function onPressExportAllBallots() {
    exportAllBallotsMutation.mutate(
      { electionId },
      {
        onSuccess: (zipContents) => {
          fileDownload(zipContents, 'ballots.zip');
        },
      }
    );
  }

  function onPressExportBallotDefinition() {
    exportBallotDefinitionMutation.mutate(
      { electionId },
      {
        onSuccess: (ballotDefinition) => {
          fileDownload(
            JSON.stringify(ballotDefinition),
            'ballot-definition.json'
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
          onPress={onPressExportBallotDefinition}
          disabled={exportBallotDefinitionMutation.isLoading}
        >
          Export Ballot Definition
        </Button>
      </P>
    </ElectionNavScreen>
  );
}

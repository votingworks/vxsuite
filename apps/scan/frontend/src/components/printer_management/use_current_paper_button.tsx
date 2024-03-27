import { Button } from '@votingworks/ui';
import { setHasPaperBeenLoaded } from '../../api';

export function UseCurrentPaperButton(): JSX.Element {
  const setHasPaperBeenLoadedMutation = setHasPaperBeenLoaded.useMutation();

  return (
    <Button
      onPress={() =>
        setHasPaperBeenLoadedMutation.mutate({ hasPaperBeenLoaded: true })
      }
      disabled={setHasPaperBeenLoadedMutation.isLoading}
    >
      Use Current Paper
    </Button>
  );
}

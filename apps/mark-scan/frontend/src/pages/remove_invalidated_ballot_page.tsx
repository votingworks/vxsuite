import { Button, Icons, P } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { useEffect } from 'react';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';
import { confirmInvalidateBallot } from '../api';

interface Props {
  paperPresent: boolean;
}

export function RemoveInvalidatedBallotPage(props: Props): JSX.Element {
  const { paperPresent } = props;

  const confirmInvalidateBallotMutation = confirmInvalidateBallot.useMutation();

  const history = useHistory();
  useEffect(() => {
    history.push('/ready-to-review');
  });

  return (
    <CenteredCardPageLayout
      icon={
        paperPresent ? (
          <Icons.Warning color="warning" />
        ) : (
          <Icons.Done color="success" />
        )
      }
      title={paperPresent ? 'Remove Ballot' : 'Ballot Removed'}
      buttons={
        <Button
          disabled={paperPresent}
          onPress={() => confirmInvalidateBallotMutation.mutate(undefined)}
          variant="primary"
        >
          Continue
        </Button>
      }
      voterFacing={false}
    >
      {!paperPresent && <P>Remember to spoil the ballot.</P>}
    </CenteredCardPageLayout>
  );
}

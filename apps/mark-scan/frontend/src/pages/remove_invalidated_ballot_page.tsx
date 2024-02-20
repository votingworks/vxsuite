import { Button, P } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { useEffect } from 'react';
import { confirmInvalidateBallot } from '../api';
import { CenteredPageLayout } from '../components/centered_page_layout';

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
    <CenteredPageLayout
      title={paperPresent ? 'Remove Ballot' : 'Ballot Removed'}
      buttons={
        <Button
          disabled={paperPresent}
          onPress={() => confirmInvalidateBallotMutation.mutate(undefined)}
        >
          Continue
        </Button>
      }
      voterFacing={false}
      textAlign="left"
    >
      {paperPresent ? (
        <P>Please remove the incorrect ballot.</P>
      ) : (
        <P>
          The incorrect ballot has been removed. Remember to spoil the ballot.
        </P>
      )}
    </CenteredPageLayout>
  );
}

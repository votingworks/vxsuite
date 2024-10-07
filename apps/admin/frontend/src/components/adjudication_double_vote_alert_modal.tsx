import { throwIllegalValue } from '@votingworks/basics';
import { Button, Font, Modal, P } from '@votingworks/ui';

export interface DoubleVoteAlert {
  type:
    | 'marked-official-candidate'
    | 'adjudicated-write-in-candidate'
    | 'adjudicated-official-candidate';
  name: string;
}

export function DoubleVoteAlertModal({
  doubleVoteAlert,
  onClose,
}: {
  doubleVoteAlert: DoubleVoteAlert;
  onClose: () => void;
}): JSX.Element {
  const { type, name } = doubleVoteAlert;
  const text = (() => {
    switch (type) {
      case 'marked-official-candidate':
        return (
          <P>
            The current ballot contest has a bubble selection marked for{' '}
            <Font weight="bold">{name}</Font>, so adjudicating the current
            write-in for <Font weight="bold">{name}</Font> would create a double
            vote.
            <br />
            <br />
            If the ballot contest does indeed contain a double vote, you can
            invalidate this write-in by selecting{' '}
            <Font weight="bold">Mark write-in as undervote</Font>.
          </P>
        );
      case 'adjudicated-official-candidate':
      case 'adjudicated-write-in-candidate':
        return (
          <P>
            The current ballot contest has a write-in that has already been
            adjudicated for <Font weight="bold">{name}</Font>, so the current
            write-in cannot also be adjudicated for{' '}
            <Font weight="bold">{name}</Font>.
            <br />
            <br />
            If the ballot contest does indeed contain a double vote, you can
            invalidate this write-in by selecting{' '}
            <Font weight="bold">Mark write-in as undervote</Font>.
          </P>
        );
      /* istanbul ignore next */
      default:
        throwIllegalValue(type);
    }
  })();

  return (
    <Modal
      title="Possible Double Vote Detected"
      content={text}
      actions={
        <Button variant="neutral" onPress={onClose}>
          Cancel
        </Button>
      }
    />
  );
}

import React from 'react';
import { useHistory } from 'react-router-dom';
import { Button } from '@votingworks/ui';
import type { ElectionListing } from '@votingworks/design-backend';

export function EditElectionButton({
  election,
}: {
  election: ElectionListing;
}): React.ReactNode {
  const history = useHistory();
  return (
    <Button
      icon="Edit"
      onPress={() => history.push(`/elections/${election.electionId}`)}
      aria-label={`Edit ${election.title || 'Untitled Election'}`}
    >
      Edit
    </Button>
  );
}

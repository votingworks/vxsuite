import { assertDefined } from '@votingworks/basics';
import { P, Button, Modal, ButtonVariant, SearchSelect } from '@votingworks/ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import type { Jurisdiction } from '@votingworks/design-backend';
import { generateId } from './utils';
import * as api from './api';

function CreateElectionModalForm({
  jurisdictions,
  createElection,
  onClose,
}: {
  jurisdictions: Jurisdiction[];
  createElection: (jurisdictionId: string) => void;
  onClose: () => void;
}): React.ReactNode {
  const createElectionMutation = api.createElection.useMutation();
  const [jurisdictionId, setJurisdictionId] = React.useState<string>(
    jurisdictions[0].id
  );

  return (
    <Modal
      title="Create Election"
      actions={
        <React.Fragment>
          <Button
            disabled={createElectionMutation.isLoading}
            onPress={() => createElection(jurisdictionId)}
            variant="primary"
          >
            Confirm
          </Button>
          <Button disabled={createElectionMutation.isLoading} onPress={onClose}>
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
      content={
        <React.Fragment>
          <P>Select a jurisdiction for the new election:</P>
          <SearchSelect
            aria-label="Jurisdiction"
            options={jurisdictions.map((jurisdiction) => ({
              label: jurisdiction.name,
              value: jurisdiction.id,
            }))}
            value={jurisdictionId}
            onChange={(value) => setJurisdictionId(assertDefined(value))}
            disabled={createElectionMutation.isLoading}
            menuPortalTarget={document.body}
          />
        </React.Fragment>
      }
    />
  );
}

function CreateElectionModal(props: {
  createElection: (jurisdictionId: string) => void;
  onClose: () => void;
}): React.ReactNode {
  const listJurisdictionsQuery = api.listJurisdictions.useQuery();

  if (!listJurisdictionsQuery.isSuccess) {
    return null;
  }
  const jurisdictions = listJurisdictionsQuery.data;

  return <CreateElectionModalForm {...props} jurisdictions={jurisdictions} />;
}

export interface CreateElectionButtonProps {
  variant?: ButtonVariant;
  disabled?: boolean;
}

export function CreateElectionButton(
  props: CreateElectionButtonProps
): React.ReactNode {
  const { variant, disabled } = props;
  const createElectionMutation = api.createElection.useMutation();
  const userQuery = api.getUser.useQuery();
  const history = useHistory();

  const [modalActive, setModalActive] = React.useState(false);

  function createElection(jurisdictionId: string) {
    createElectionMutation.mutate(
      { id: generateId(), jurisdictionId },
      {
        onSuccess(result) {
          if (result.isOk()) {
            const electionId = result.ok();
            history.push(`/elections/${electionId}`);
            return;
          }
          // TODO handle error case
          throw result.err();
        },
      }
    );
  }

  /* istanbul ignore next - @preserve */
  if (!userQuery.isSuccess) {
    return null;
  }
  const user = userQuery.data;

  return (
    <React.Fragment>
      <Button
        variant={variant}
        icon="Add"
        onPress={
          user.type === 'jurisdiction_user' && user.jurisdictions.length === 1
            ? () => createElection(user.jurisdictions[0].id)
            : () => setModalActive(true)
        }
        disabled={modalActive || disabled}
      >
        Create Election
      </Button>
      {modalActive && (
        <CreateElectionModal
          createElection={createElection}
          onClose={() => setModalActive(false)}
        />
      )}
    </React.Fragment>
  );
}

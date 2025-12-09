import { assert, assertDefined } from '@votingworks/basics';
import { P, Button, Modal, ButtonVariant } from '@votingworks/ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import { generateId } from './utils';
import * as api from './api';
import { JurisdictionSelect } from './jurisdiction_select';

export interface CreateElectionButtonProps {
  variant?: ButtonVariant;
  disabled?: boolean;
}

export function CreateElectionButton(
  props: CreateElectionButtonProps
): React.ReactNode {
  const { variant, disabled } = props;
  const createMutation = api.createElection.useMutation();
  const getUserFeaturesQuery = api.getUserFeatures.useQuery();

  const [jurisdictionId, setJurisdictionId] = React.useState<string>();
  const [modalActive, setModalActive] = React.useState(false);

  const history = useHistory();

  const userQuery = api.getUser.useQuery();
  const user = userQuery.data;
  React.useEffect(() => {
    if (user) {
      setJurisdictionId(assertDefined(user.jurisdictions[0]).id);
    }
  }, [user]);

  const mutateCreateElection = createMutation.mutate;
  const createElection = React.useCallback(() => {
    assert(!!jurisdictionId);

    mutateCreateElection(
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
  }, [history, mutateCreateElection, jurisdictionId]);

  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

  return (
    <React.Fragment>
      <Button
        variant={variant}
        icon="Add"
        onPress={
          features.ACCESS_ALL_ORGS || (user?.jurisdictions || []).length > 1
            ? setModalActive
            : createElection
        }
        value
        disabled={modalActive || disabled}
      >
        Create Election
      </Button>
      {modalActive && (
        <Modal
          title="Create Election"
          actions={
            <React.Fragment>
              <Button
                disabled={createMutation.isLoading}
                onPress={createElection}
                variant="primary"
              >
                Confirm
              </Button>
              <Button
                disabled={createMutation.isLoading}
                onPress={setModalActive}
                value={false}
              >
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={() => setModalActive(false)}
          content={
            <React.Fragment>
              <P>Select a jurisdiction for the new election:</P>
              <JurisdictionSelect
                disabled={createMutation.isLoading}
                onChange={setJurisdictionId}
                selectedJurisdictionId={jurisdictionId}
              />
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}

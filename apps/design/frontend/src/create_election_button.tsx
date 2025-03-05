import { assert } from '@votingworks/basics';
import { ElectionId } from '@votingworks/types';
import { P, Button, Modal, ButtonVariant } from '@votingworks/ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { generateId } from './utils';
import * as api from './api';
import { OrgSelect } from './org_select';

export interface CreateElectionButtonProps {
  variant?: ButtonVariant;
}

const OrgModal = styled(Modal)`
  /* Allow modal to grow with user zoom setting and cap near screen height.  */
  min-height: min(40rem, 98%);
`;

export function CreateElectionButton(
  props: CreateElectionButtonProps
): React.ReactNode {
  const { variant } = props;
  const createMutation = api.createElection.useMutation();
  const getUserFeaturesQuery = api.getUserFeatures.useQuery();

  const [orgId, setOrgId] = React.useState<string>();
  const [modalActive, setModalActive] = React.useState(false);

  const history = useHistory();

  const userQuery = api.getUser.useQuery();
  const user = userQuery.data;
  React.useEffect(() => {
    if (user) {
      setOrgId(user.orgId);
    }
  }, [user]);

  const mutateCreateElection = createMutation.mutate;
  const createElection = React.useCallback(() => {
    assert(!!orgId);

    mutateCreateElection(
      { id: generateId() as ElectionId, orgId },
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
  }, [history, mutateCreateElection, orgId]);

  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

  return (
    <React.Fragment>
      <Button
        variant={variant}
        icon="Add"
        onPress={features.ACCESS_ALL_ORGS ? setModalActive : createElection}
        value
        disabled={modalActive}
      >
        Create Election
      </Button>
      {modalActive && (
        <OrgModal
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
              <P>Select an organization for the new election:</P>
              <OrgSelect
                disabled={createMutation.isLoading}
                onChange={setOrgId}
                selectedOrgId={orgId}
              />
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}

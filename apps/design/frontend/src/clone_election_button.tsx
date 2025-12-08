import { assert } from '@votingworks/basics';
import { P, Button, Modal, ButtonVariant, Icons, Font } from '@votingworks/ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import type { ElectionListing } from '@votingworks/design-backend';
import * as api from './api';
import { OrgSelect } from './org_select';
import { Tooltip, TooltipContainer } from './tooltip';

export interface CloneElectionButtonProps {
  election: ElectionListing;
  variant?: ButtonVariant;
}

export function CloneElectionButton(
  props: CloneElectionButtonProps
): React.ReactNode {
  const { election, variant } = props;

  const history = useHistory();
  const getUserFeaturesQuery = api.getUserFeatures.useQuery();
  const user = api.getUser.useQuery().data;

  const [orgId, setOrgId] = React.useState<string | undefined>(
    user?.organizations[0]?.id
  );
  const [modalActive, setModalActive] = React.useState(false);

  const cloneMutation = api.cloneElection.useMutation();
  const mutateCloneElection = cloneMutation.mutate;
  const cloneElection = React.useCallback(() => {
    assert(!!orgId);

    mutateCloneElection(
      { id: election.electionId, orgId },
      {
        onSuccess(electionId) {
          history.push(`/elections/${electionId}`);
        },
      }
    );
  }, [election, history, mutateCloneElection, orgId]);

  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

  return (
    <React.Fragment>
      <TooltipContainer>
        <Tooltip alignTo="right" bold>
          Make a copy of {election.title}
        </Tooltip>
        <Button
          variant={variant}
          onPress={
            features.ACCESS_ALL_ORGS || (user?.organizations || []).length > 1
              ? setModalActive
              : cloneElection
          }
          aria-label={`Make a copy of ${election.title}`}
          value
          disabled={cloneMutation.isLoading || modalActive}
        >
          <Icons.Copy />
        </Button>
      </TooltipContainer>
      {modalActive && (
        <Modal
          title="Duplicate Election"
          actions={
            <React.Fragment>
              <Button
                disabled={cloneMutation.isLoading}
                onPress={cloneElection}
                variant="primary"
              >
                Confirm
              </Button>
              <Button
                disabled={cloneMutation.isLoading}
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
              <P>
                You are making a copy of{' '}
                <Font weight="bold">{election.title}</Font>.
              </P>
              <P>Select an organization for the new election:</P>
              <OrgSelect
                disabled={cloneMutation.isLoading}
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

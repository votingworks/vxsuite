import { assert } from '@votingworks/basics';
import { P, Button, Modal, ButtonVariant, Icons, Font } from '@votingworks/ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import type { ElectionListing } from '@votingworks/design-backend';
import * as api from './api';
import { OrgSelect } from './org_select';

export interface CloneElectionButtonProps {
  election: ElectionListing;
  variant?: ButtonVariant;
}

const OrgModal = styled(Modal)`
  /* Allow modal to grow with user zoom setting and cap near screen height. */
  min-height: min(40rem, 98%);
`;

const Tooltip = styled.span`
  /*
   * [TODO] No easy way to use theme colors for transparency, since they're
   * defined in 'HSL' - need to bring in the 'polished' lib used in libs/ui, or
   * create a generalized tooltip component in libs/ui.
   */
  background: rgba(0, 0, 0, 75%);
  border-radius: 0.25rem;
  bottom: calc(100% + 0.7rem);
  box-shadow: 0.1rem 0.1rem 0.2rem 0.05rem rgba(0, 0, 0, 25%);
  color: #fff;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.5rem 0.75rem 0.6rem;
  position: absolute;
  right: 0;
  width: max-content;

  &:hover {
    /* Prevent it from sticking around when moving quickly between buttons. */
    display: none !important;
  }
`;

const ButtonContainer = styled.span`
  position: relative;

  ${Tooltip} {
    display: none;
  }

  &:focus,
  &:hover {
    ${Tooltip} {
      display: block;
    }
  }
`;

export function CloneElectionButton(
  props: CloneElectionButtonProps
): React.ReactNode {
  const { election, variant } = props;

  const history = useHistory();
  const getUserFeaturesQuery = api.getUserFeatures.useQuery();
  const user = api.getUser.useQuery().data;

  const [orgId, setOrgId] = React.useState<string | undefined>(user?.orgId);
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
      <ButtonContainer>
        <Tooltip role="tooltip">{`Make a copy of ${election.title}`}</Tooltip>
        <Button
          variant={variant}
          onPress={features.ACCESS_ALL_ORGS ? setModalActive : cloneElection}
          aria-label={`Make a copy of ${election.title}`}
          value
          disabled={cloneMutation.isLoading || modalActive}
        >
          <Icons.Copy />
        </Button>
      </ButtonContainer>
      {modalActive && (
        <OrgModal
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

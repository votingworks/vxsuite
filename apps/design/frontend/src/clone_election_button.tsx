import { assertDefined } from '@votingworks/basics';
import {
  P,
  Button,
  Modal,
  ButtonVariant,
  Icons,
  Font,
  SearchSelect,
} from '@votingworks/ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import type {
  ElectionListing,
  Jurisdiction,
} from '@votingworks/design-backend';
import * as api from './api';
import { Tooltip, TooltipContainer } from './tooltip';

function CloneElectionModalForm({
  jurisdictions,
  election,
  cloneElection,
  onClose,
}: {
  jurisdictions: Jurisdiction[];
  election: ElectionListing;
  cloneElection: (jurisdictionId: string) => void;
  onClose: () => void;
}): React.ReactNode {
  const cloneMutation = api.cloneElection.useMutation();
  const [jurisdictionId, setJurisdictionId] = React.useState<string>(
    jurisdictions[0].id
  );

  return (
    <Modal
      title="Duplicate Election"
      actions={
        <React.Fragment>
          <Button
            disabled={cloneMutation.isLoading}
            onPress={() => cloneElection(jurisdictionId)}
            variant="primary"
          >
            Confirm
          </Button>
          <Button disabled={cloneMutation.isLoading} onPress={onClose}>
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
      content={
        <React.Fragment>
          <P>
            You are making a copy of <Font weight="bold">{election.title}</Font>
            .
          </P>
          <P>Select a jurisdiction for the new election:</P>
          <SearchSelect
            aria-label="Jurisdiction"
            options={jurisdictions.map((jurisdiction) => ({
              label: jurisdiction.name,
              value: jurisdiction.id,
            }))}
            value={jurisdictionId}
            onChange={(value) => setJurisdictionId(assertDefined(value))}
            disabled={cloneMutation.isLoading}
            menuPortalTarget={document.body}
          />
        </React.Fragment>
      }
    />
  );
}

function CloneElectionModal(props: {
  election: ElectionListing;
  cloneElection: (jurisdictionId: string) => void;
  onClose: () => void;
}): React.ReactNode {
  const listJurisdictionsQuery = api.listJurisdictions.useQuery();

  if (!listJurisdictionsQuery.isSuccess) {
    return null;
  }
  const jurisdictions = listJurisdictionsQuery.data;

  return <CloneElectionModalForm {...props} jurisdictions={jurisdictions} />;
}

export interface CloneElectionButtonProps {
  election: ElectionListing;
  variant?: ButtonVariant;
}

export function CloneElectionButton(
  props: CloneElectionButtonProps
): React.ReactNode {
  const { election, variant } = props;

  const history = useHistory();
  const cloneMutation = api.cloneElection.useMutation();
  const userQuery = api.getUser.useQuery();

  const [modalActive, setModalActive] = React.useState(false);

  function cloneElection(jurisdictionId: string) {
    cloneMutation.mutate(
      { id: election.electionId, jurisdictionId },
      {
        onSuccess(electionId) {
          history.push(`/elections/${electionId}`);
        },
      }
    );
  }

  /* istanbul ignore next - @preserve */
  if (!userQuery.isSuccess) {
    return null;
  }
  const user = userQuery.data;

  const buttonLabel = election.externalSource
    ? 'Cannot copy election loaded from an external source'
    : `Make a copy of ${election.title || 'Untitled Election'}`;
  return (
    <React.Fragment>
      <TooltipContainer>
        <Tooltip alignTo="right" bold>
          {buttonLabel}
        </Tooltip>
        <Button
          variant={variant}
          onPress={
            user.type === 'jurisdiction_user' && user.jurisdictions.length === 1
              ? () => cloneElection(user.jurisdictions[0].id)
              : () => setModalActive(true)
          }
          aria-label={buttonLabel}
          disabled={
            Boolean(election.externalSource) ||
            cloneMutation.isLoading ||
            modalActive
          }
        >
          <Icons.Copy />
        </Button>
      </TooltipContainer>
      {modalActive && (
        <CloneElectionModal
          election={election}
          cloneElection={cloneElection}
          onClose={() => setModalActive(false)}
        />
      )}
    </React.Fragment>
  );
}

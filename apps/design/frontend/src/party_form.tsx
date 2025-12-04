import React, { useState } from 'react';
import { Button, P, Modal, Callout } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { ElectionId, Party } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { Form, FormActionsRow, InputGroup } from './layout';
import { routes } from './routes';
import { createParty, deleteParty, updateParty } from './api';
import { generateId } from './utils';

export interface PartyFormProps {
  electionId: ElectionId;
  savedParty?: Party;
}

export function PartyForm(props: PartyFormProps): JSX.Element {
  const { electionId, savedParty } = props;
  const [party, setParty] = useState<Party>(
    savedParty ??
      // To make mocked IDs predictable in tests, we pass a function here
      // so it will only be called on initial render.
      createBlankParty
  );
  const createPartyMutation = createParty.useMutation();
  const updatePartyMutation = updateParty.useMutation();
  const deletePartyMutation = deleteParty.useMutation();
  const history = useHistory();
  const partyRoutes = routes.election(electionId).parties;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function goBackToPartiesList() {
    history.push(partyRoutes.root.path);
  }

  function onSubmit() {
    if (savedParty) {
      updatePartyMutation.mutate(
        { electionId, updatedParty: party },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToPartiesList();
            }
          },
        }
      );
    } else {
      createPartyMutation.mutate(
        { electionId, newParty: party },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToPartiesList();
            }
          },
        }
      );
    }
  }

  function onDelete() {
    deletePartyMutation.mutate(
      { electionId, partyId: party.id },
      { onSuccess: goBackToPartiesList }
    );
  }

  const someMutationIsLoading =
    createPartyMutation.isLoading ||
    updatePartyMutation.isLoading ||
    deletePartyMutation.isLoading;

  const error =
    createPartyMutation.data?.err() || updatePartyMutation.data?.err();
  const errorMessage =
    error &&
    (() => {
      switch (error) {
        case 'duplicate-name':
          return (
            <Callout icon="Danger" color="danger">
              There is already a party with the same short name.
            </Callout>
          );
        case 'duplicate-full-name':
          return (
            <Callout icon="Danger" color="danger">
              There is already a party with the same full name.
            </Callout>
          );
        case 'duplicate-abbrev':
          return (
            <Callout icon="Danger" color="danger">
              There is already a party with the same abbreviation.
            </Callout>
          );
        default: {
          /* istanbul ignore next - @preserve */
          return throwIllegalValue(error);
        }
      }
    })();

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        goBackToPartiesList();
      }}
    >
      <InputGroup label="Full Name">
        <input
          type="text"
          value={party.fullName}
          onChange={(e) => setParty({ ...party, fullName: e.target.value })}
          onBlur={(e) =>
            setParty({ ...party, fullName: e.target.value.trim() })
          }
          autoComplete="off"
          required
        />
      </InputGroup>
      <InputGroup label="Short Name">
        <input
          type="text"
          value={party.name}
          onChange={(e) => setParty({ ...party, name: e.target.value })}
          onBlur={(e) => setParty({ ...party, name: e.target.value.trim() })}
          autoComplete="off"
          required
        />
      </InputGroup>
      <InputGroup label="Abbreviation">
        <input
          type="text"
          value={party.abbrev}
          onChange={(e) => setParty({ ...party, abbrev: e.target.value })}
          onBlur={(e) => setParty({ ...party, abbrev: e.target.value.trim() })}
          autoComplete="off"
          required
        />
      </InputGroup>
      {errorMessage}
      <div>
        <FormActionsRow>
          <Button type="reset">Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            icon="Done"
            disabled={someMutationIsLoading}
          >
            Save
          </Button>
        </FormActionsRow>
        {savedParty && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={() => setIsConfirmingDelete(true)}
              disabled={someMutationIsLoading}
            >
              Delete Party
            </Button>
          </FormActionsRow>
        )}
        {savedParty && isConfirmingDelete && (
          <Modal
            title="Delete Party"
            content={
              <P>
                Are you sure you want to delete this party? This action cannot
                be undone.
              </P>
            }
            actions={
              <React.Fragment>
                <Button onPress={onDelete} variant="danger" autoFocus>
                  Delete Party
                </Button>
                <Button onPress={() => setIsConfirmingDelete(false)}>
                  Cancel
                </Button>
              </React.Fragment>
            }
            onOverlayClick={
              /* istanbul ignore next - @preserve */
              () => setIsConfirmingDelete(false)
            }
          />
        )}
      </div>
    </Form>
  );
}

function createBlankParty(): Party {
  return {
    id: generateId(),
    name: '',
    fullName: '',
    abbrev: '',
  };
}

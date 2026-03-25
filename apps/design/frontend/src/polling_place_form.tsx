import React, { useState } from 'react';
import styled from 'styled-components';

import {
  Button,
  Callout,
  P,
  CheckboxGroup,
  Modal,
  RadioGroup,
} from '@votingworks/ui';
import {
  ElectionId,
  PollingPlace,
  ElectionStringKey,
  Precinct,
} from '@votingworks/types';
import { assertDefined, find, throwIllegalValue } from '@votingworks/basics';

import { routes } from './routes';
import { Row, InputGroup, FieldName } from './layout';
import * as api from './api';
import { generateId } from './utils';
import {
  FormBody,
  FormErrorContainer,
  FormFixed,
  FormFooter,
  FormTitle,
} from './form_fixed';
import { InputWithAudio } from './ballot_audio/input_with_audio';

export interface PollingPlaceFormProps {
  editing: boolean;
  electionId: ElectionId;
  exit: () => void;
  savedPlace?: PollingPlace;
  switchToEdit: (placeId: string) => void;
  switchToView: (placeId: string) => void;
}

const SelectAllButton = styled(Button)`
  font-size: 0.8rem;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const TYPE_OPTIONS = [
  { value: 'absentee', label: 'Absentee Voting' },
  { value: 'early_voting', label: 'Early Voting' },
  { value: 'election_day', label: 'Election Day' },
] as const;

export function PollingPlaceForm(
  props: PollingPlaceFormProps
): React.ReactNode {
  const { editing, electionId, exit, savedPlace, switchToEdit, switchToView } =
    props;

  const [draft, setDraft] = useState<PollingPlace>(
    savedPlace || createBlankPlace
  );

  const precinctsQuery = api.listPrecincts.useQuery(electionId);
  const finalizedAtQuery = api.getBallotsFinalizedAt.useQuery(electionId);

  const setPlaceMutation = api.setPollingPlace.useMutation();
  const deletePlaceMutation = api.deletePollingPlace.useMutation();

  if (!precinctsQuery.isSuccess || !finalizedAtQuery.isSuccess) return null;

  const precincts = precinctsQuery.data;
  const finalized = !!finalizedAtQuery.data;

  function onSubmit() {
    setPlaceMutation.mutate(
      { electionId, place: draft },
      {
        onSuccess: (result) => {
          if (result.isOk()) switchToView(draft.id);
        },
      }
    );
  }

  function onConfirmDelete() {
    deletePlaceMutation.mutate(
      { electionId, id: assertDefined(savedPlace).id },
      { onSuccess: exit }
    );
  }

  function setPrecincts(ids: string[]) {
    const copy: PollingPlace = { ...draft, precincts: {} };
    for (const id of ids) copy.precincts[id] = { type: 'whole' };
    setDraft(copy);
  }

  function clearAllPrecincts() {
    setDraft({ ...draft, precincts: {} });
  }

  function selectAllPrecincts() {
    const copy: PollingPlace = { ...draft, precincts: {} };
    for (const p of precincts) copy.precincts[p.id] = { type: 'whole' };
    setDraft(copy);
  }

  const noPrecinctsCallout = (
    <Callout icon="Warning" color="warning">
      No precincts selected.
    </Callout>
  );

  const someMutationIsLoading =
    setPlaceMutation.isLoading ||
    setPlaceMutation.isLoading ||
    deletePlaceMutation.isLoading;

  const errorMessage = (() => {
    if (!setPlaceMutation.data?.isErr()) return undefined;

    const error = setPlaceMutation.data.err();
    switch (error) {
      case 'duplicate-name':
        return (
          <Callout icon="Danger" color="danger">
            There is already a polling place with the same name.
          </Callout>
        );

      case 'invalid-precinct':
        return (
          <Callout icon="Danger" color="danger">
            Something went wrong. Please refresh the page and try again.
          </Callout>
        );

      /* istanbul ignore next - @preserve */
      default: {
        throwIllegalValue(error);
      }
    }
  })();

  const disabled = !editing || someMutationIsLoading;
  const precinctIds = Object.keys(draft.precincts);
  const allSelected = precinctIds.length === precincts.length;

  const title = (() => {
    if (!savedPlace) return 'Add Polling Place';
    if (editing) return 'Edit Polling Place';
    return 'Polling Place Info';
  })();

  return (
    <FormFixed
      editing={editing}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        if (!savedPlace) return exit();

        setDraft(savedPlace);
        if (editing) {
          switchToView(savedPlace.id);
        } else {
          switchToEdit(savedPlace.id);
        }
      }}
    >
      <FormBody>
        <FormTitle>{title}</FormTitle>
        <div
          style={{
            display: 'inherit',
            flexDirection: 'inherit',
            gap: 'inherit',
            maxWidth: 'max-content',
          }}
        >
          <InputGroup label="Name">
            <InputWithAudio
              audioScreenUrl={routes.election(electionId).pollingPlaces.audio({
                placeId: draft.id,
                stringKey: ElectionStringKey.POLLING_PLACE_NAME,
              })}
              autoComplete="off"
              disabled={disabled}
              editing={editing}
              onBlur={(e) =>
                setDraft({ ...draft, name: e.target.value.trim() })
              }
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              type="text"
              value={draft.name}
            />
          </InputGroup>

          <div style={{ maxWidth: 'max-content' }}>
            <FieldName
              style={{
                alignItems: 'baseline',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              Type
            </FieldName>
            <RadioGroup
              disabled={disabled}
              hideLabel
              label="Polling Place Type"
              onChange={(type) =>
                setDraft({ ...draft, type: assertDefined(type) })
              }
              options={
                editing
                  ? TYPE_OPTIONS
                  : [find(TYPE_OPTIONS, (o) => o.value === draft.type)]
              }
              value={draft.type}
            />
          </div>

          <div style={{ width: '100%' }}>
            <FieldName
              style={{
                alignItems: 'center',
                display: 'flex',
                justifyContent: 'space-between',
                minWidth: '100%',
              }}
            >
              <span>Precincts</span>
              {editing && (
                <SelectAllButton
                  fill="transparent"
                  icon={
                    allSelected
                      ? 'Checkbox'
                      : precinctIds.length > 0
                      ? 'CheckboxPartial'
                      : 'Square'
                  }
                  onPress={allSelected ? clearAllPrecincts : selectAllPrecincts}
                  variant="primary"
                >
                  {allSelected ? 'Clear All' : 'Select All'}
                </SelectAllButton>
              )}
            </FieldName>
            <Row style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ width: '100%' }}>
                <PrecinctList
                  disabled={disabled}
                  editing={editing}
                  noPrecinctsCallout={noPrecinctsCallout}
                  onChange={setPrecincts}
                  precincts={precincts}
                  value={precinctIds}
                />
              </div>
            </Row>
          </div>
        </div>
      </FormBody>

      <FormErrorContainer>{errorMessage}</FormErrorContainer>

      {!finalized && (
        <FormFooter style={{ justifyContent: 'space-between' }}>
          {editing ? (
            <Row style={{ flexWrap: 'wrap-reverse', gap: '0.5rem' }}>
              <Button disabled={disabled} type="reset">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon="Done"
                disabled={disabled}
              >
                Save
              </Button>
            </Row>
          ) : (
            <Button icon="Edit" type="reset" variant="primary">
              Edit
            </Button>
          )}

          {savedPlace && (
            <DeleteModalButton
              disabled={someMutationIsLoading}
              onConfirmDelete={onConfirmDelete}
              savedPlace={savedPlace}
            />
          )}
        </FormFooter>
      )}
    </FormFixed>
  );
}

// [TODO] Update to support individual precinct split selection.
function PrecinctList(props: {
  disabled?: boolean;
  editing?: boolean;
  noPrecinctsCallout?: React.ReactNode;
  onChange: (precinctIds: string[]) => void;
  precincts: readonly Precinct[];
  value: string[];
}) {
  const { disabled, precincts, editing, noPrecinctsCallout, onChange, value } =
    props;

  const filteredPrecincts = editing
    ? precincts
    : precincts.filter((d) => value.includes(d.id));

  return (
    <CheckboxGroup
      disabled={disabled}
      label="Precincts"
      hideLabel
      noOptionsMessage={noPrecinctsCallout}
      options={filteredPrecincts.map((precinct) => ({
        value: precinct.id,
        label: precinct.name,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

function DeleteModalButton(props: {
  disabled?: boolean;
  onConfirmDelete: () => void;
  savedPlace: PollingPlace;
}) {
  const { disabled, savedPlace, onConfirmDelete } = props;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  return (
    <React.Fragment>
      <Button
        disabled={disabled}
        fill="outlined"
        icon="Delete"
        onPress={() => setIsConfirmingDelete(true)}
        variant="danger"
      >
        Delete Polling Place
      </Button>

      {isConfirmingDelete && (
        <Modal
          title={`Delete ${savedPlace.name}`}
          content={
            <div>
              <P>
                Are you sure you want to delete this polling place? This action
                cannot be undone.
              </P>
            </div>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                onPress={onConfirmDelete}
                autoFocus
                disabled={disabled}
              >
                Delete Polling Place
              </Button>

              <Button
                disabled={disabled}
                onPress={() => setIsConfirmingDelete(false)}
              >
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
    </React.Fragment>
  );
}

function createBlankPlace(): PollingPlace {
  return { name: '', id: generateId(), precincts: {}, type: 'election_day' };
}

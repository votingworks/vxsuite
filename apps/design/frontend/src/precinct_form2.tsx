import React, { useState } from 'react';
import {
  Button,
  P,
  Modal,
  Callout,
  Card,
  CheckboxGroup,
} from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import {
  ElectionId,
  ElectionStringKey,
  hasSplits,
  PrecinctSplit,
  Precinct,
  District,
} from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { Column, FieldName, InputGroup, Row } from './layout';
import { routes } from './routes';
import {
  createPrecinct,
  deletePrecinct,
  getBallotsFinalizedAt,
  listDistricts,
  updatePrecinct,
} from './api';
import { generateId, replaceAtIndex } from './utils';
import { InputWithAudio } from './ballot_audio/input_with_audio';
import * as api from './api';
import { SealImageInput } from './seal_image_input';
import { SignatureImageInput } from './signature_image_input';
import {
  FormBody,
  FormErrorContainer,
  FormFixed,
  FormFooter,
  FormTitle,
} from './form_fixed';

export interface PrecinctFormProps {
  editing: boolean;
  electionId: ElectionId;
  savedPrecinct?: Precinct;
  title: React.ReactNode;
}

export function PrecinctForm(props: PrecinctFormProps): React.ReactNode {
  const { editing, electionId, savedPrecinct, title } = props;

  const getStateFeaturesQuery = api.getStateFeatures.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  const [precinct, setPrecinct] = useState<Precinct>(
    savedPrecinct ??
      // To make mocked IDs predictable in tests, we pass a function here
      // so it will only be called on initial render.
      createBlankPrecinct
  );

  const createPrecinctMutation = createPrecinct.useMutation();
  const updatePrecinctMutation = updatePrecinct.useMutation();
  const deletePrecinctMutation = deletePrecinct.useMutation();

  const history = useHistory();
  const precinctRoutes = routes.election(electionId).precincts2;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  if (!(getStateFeaturesQuery.isSuccess && listDistrictsQuery.isSuccess)) {
    return null;
  }

  const features = getStateFeaturesQuery.data;
  const districts = listDistrictsQuery.data;
  const finalized = !!getBallotsFinalizedAtQuery.data;

  function goBackToPrecinctsList() {
    history.push(precinctRoutes.root.path);
  }

  function setIsEditing(switchToEdit: boolean) {
    if (!savedPrecinct) return history.replace(precinctRoutes.root.path);

    history.replace(
      switchToEdit
        ? precinctRoutes.edit(savedPrecinct.id).path
        : precinctRoutes.view(savedPrecinct.id).path
    );
  }

  function onSubmit() {
    if (savedPrecinct) {
      updatePrecinctMutation.mutate(
        { electionId, updatedPrecinct: precinct },
        {
          onSuccess: (result) => {
            if (result.isErr()) return;
            setIsEditing(false);
          },
        }
      );
    } else {
      createPrecinctMutation.mutate(
        { electionId, newPrecinct: precinct },
        {
          onSuccess: (result) => {
            if (result.isErr()) return;
            history.replace(precinctRoutes.view(precinct.id).path);
          },
        }
      );
    }
  }

  function setSplits(splits: PrecinctSplit[]) {
    assert(precinct);
    setPrecinct({
      id: precinct.id,
      name: precinct.name,
      splits,
    });
  }

  function setSplit(index: number, split: PrecinctSplit) {
    assert(precinct && hasSplits(precinct));
    setSplits(replaceAtIndex(precinct.splits, index, split));
  }

  function onAddSplitPress() {
    assert(precinct);
    if (hasSplits(precinct)) {
      setSplits([
        ...precinct.splits,
        {
          id: generateId(),
          name: '',
          districtIds: [],
        },
      ]);
    } else {
      setSplits([
        {
          id: generateId(),
          name: '',
          districtIds: precinct.districtIds,
        },
        {
          id: generateId(),
          name: '',
          districtIds: [],
        },
      ]);
    }

    // If adding to an existing precinct in view mode, switch to edit mode:
    if (savedPrecinct) setIsEditing(true);
  }

  function onRemoveSplitPress(index: number) {
    assert(precinct && hasSplits(precinct));
    const { splits, ...rest } = precinct;
    const newSplits = splits.filter((_, i) => i !== index);
    if (newSplits.length > 1) {
      setPrecinct({
        ...rest,
        splits: newSplits,
      });
    } else {
      setPrecinct({
        ...rest,
        districtIds: newSplits[0].districtIds,
      });
    }
  }

  function onDelete() {
    deletePrecinctMutation.mutate(
      { electionId, precinctId: assertDefined(savedPrecinct).id },
      { onSuccess: goBackToPrecinctsList }
    );
  }

  const noDistrictsCallout = (
    <Callout icon="Warning" color="warning">
      No districts yet.
    </Callout>
  );

  const someMutationIsLoading =
    createPrecinctMutation.isLoading ||
    updatePrecinctMutation.isLoading ||
    deletePrecinctMutation.isLoading;

  const errorMessage = (() => {
    if (
      createPrecinctMutation.data?.isErr() ||
      updatePrecinctMutation.data?.isErr()
    ) {
      const error = assertDefined(
        createPrecinctMutation.data?.err() || updatePrecinctMutation.data?.err()
      );
      switch (error) {
        case 'duplicate-precinct-name':
          return (
            <Callout icon="Danger" color="danger">
              There is already a precinct with the same name.
            </Callout>
          );
        case 'duplicate-split-name':
          return (
            <Callout icon="Danger" color="danger">
              Precinct splits must have different names.
            </Callout>
          );
        case 'duplicate-split-districts':
          return (
            <Callout icon="Danger" color="danger">
              Each precinct split must have a different set of districts.
            </Callout>
          );
        default: {
          /* istanbul ignore next - @preserve */
          throwIllegalValue(error);
        }
      }
    }
  })();

  const disabled = !editing || someMutationIsLoading;

  return (
    <FormFixed
      editing={editing}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        setPrecinct(savedPrecinct || createBlankPrecinct);
        setIsEditing(!editing);
      }}
    >
      <FormBody>
        <FormTitle>{title}</FormTitle>
        <InputGroup label="Name">
          <InputWithAudio
            audioScreenUrl={precinctRoutes.audio(
              precinct.id,
              'text',
              ElectionStringKey.PRECINCT_NAME,
              precinct.id
            )}
            autoComplete="off"
            autoFocus={!precinct.name}
            disabled={disabled}
            editing={editing}
            onBlur={(e) =>
              setPrecinct({ ...precinct, name: e.target.value.trim() })
            }
            onChange={(e) => setPrecinct({ ...precinct, name: e.target.value })}
            required
            style={{ maxWidth: '20rem' }}
            type="text"
            value={precinct.name}
          />
        </InputGroup>
        <div>
          <FieldName>{hasSplits(precinct) ? 'Splits' : 'Districts'}</FieldName>
          <Row style={{ gap: '1rem', flexWrap: 'wrap' }}>
            {hasSplits(precinct) ? (
              <React.Fragment>
                {precinct.splits.map((split, index) => (
                  <Card key={split.id}>
                    <Column style={{ gap: '1rem', height: '100%' }}>
                      <InputGroup label="Name">
                        <InputWithAudio
                          audioScreenUrl={precinctRoutes.audio(
                            precinct.id,
                            'text',
                            ElectionStringKey.PRECINCT_SPLIT_NAME,
                            split.id
                          )}
                          autoFocus={!split.name}
                          disabled={disabled}
                          editing={editing}
                          type="text"
                          value={split.name}
                          onChange={(e) =>
                            setSplit(index, { ...split, name: e.target.value })
                          }
                          onBlur={(e) =>
                            setSplit(index, {
                              ...split,
                              name: e.target.value.trim(),
                            })
                          }
                          autoComplete="off"
                          required
                        />
                      </InputGroup>
                      <DistrictList
                        disabled={disabled}
                        districts={districts}
                        editing={editing}
                        noDistrictsCallout={noDistrictsCallout}
                        onChange={(districtIds) =>
                          setSplit(index, {
                            ...split,
                            districtIds,
                          })
                        }
                        value={[...split.districtIds]}
                      />

                      {features.PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE && (
                        <InputGroup label="Election Title Override">
                          <input
                            type="text"
                            value={split.electionTitleOverride ?? ''}
                            onChange={(e) =>
                              setSplit(index, {
                                ...split,
                                electionTitleOverride: e.target.value,
                              })
                            }
                          />
                        </InputGroup>
                      )}

                      {features.PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE && (
                        <InputGroup label="Election Seal Override">
                          <SealImageInput
                            value={split.electionSealOverride}
                            onChange={(value) =>
                              setSplit(index, {
                                ...split,
                                electionSealOverride: value,
                              })
                            }
                          />
                        </InputGroup>
                      )}

                      {features.PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE && (
                        <div>
                          <FieldName>Signature Image</FieldName>
                          <SignatureImageInput
                            value={split.clerkSignatureImage}
                            onChange={(value) =>
                              setSplit(index, {
                                ...split,
                                clerkSignatureImage: value,
                              })
                            }
                          />
                        </div>
                      )}

                      {features.PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE && (
                        <InputGroup label="Signature Caption">
                          <input
                            type="text"
                            value={split.clerkSignatureCaption ?? ''}
                            onChange={(e) =>
                              setSplit(index, {
                                ...split,
                                clerkSignatureCaption: e.target.value,
                              })
                            }
                          />
                        </InputGroup>
                      )}
                      {editing && (
                        <Button
                          style={{ marginTop: 'auto' }}
                          onPress={onRemoveSplitPress}
                          value={index}
                        >
                          Remove Split
                        </Button>
                      )}
                    </Column>
                  </Card>
                ))}
                {!finalized && (
                  <div>
                    <Button icon="Add" onPress={onAddSplitPress}>
                      Add Split
                    </Button>
                  </div>
                )}
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div style={{ minWidth: '12rem' }}>
                  <DistrictList
                    disabled={disabled}
                    districts={districts}
                    editing={editing}
                    noDistrictsCallout={noDistrictsCallout}
                    onChange={(districtIds) =>
                      setPrecinct({
                        ...precinct,
                        districtIds,
                      })
                    }
                    value={[...precinct.districtIds]}
                  />
                </div>
                {!finalized && (
                  <div>
                    <Button icon="Add" onPress={onAddSplitPress}>
                      Add Split
                    </Button>
                  </div>
                )}
              </React.Fragment>
            )}
          </Row>
        </div>
      </FormBody>

      <FormErrorContainer>{errorMessage}</FormErrorContainer>

      {!finalized && (
        <FormFooter>
          <PrimaryFormActions disabled={disabled} editing={editing} />

          <div style={{ flexGrow: 1 }} />

          {savedPrecinct && (
            <Button
              variant="danger"
              fill="outlined"
              icon="Delete"
              onPress={setIsConfirmingDelete}
              disabled={someMutationIsLoading}
              // eslint-disable-next-line react/jsx-boolean-value
              value={true}
            >
              Delete Precinct
            </Button>
          )}
        </FormFooter>
      )}

      {savedPrecinct && isConfirmingDelete && (
        <Modal
          title="Delete Precinct"
          content={
            <div>
              <P>
                Are you sure you want to delete this precinct? This action
                cannot be undone.
              </P>
            </div>
          }
          actions={
            <React.Fragment>
              <Button
                onPress={onDelete}
                variant="danger"
                autoFocus
                disabled={someMutationIsLoading}
              >
                Delete Precinct
              </Button>
              <Button
                disabled={someMutationIsLoading}
                onPress={setIsConfirmingDelete}
                value={false}
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
    </FormFixed>
  );
}

function DistrictList(props: {
  disabled?: boolean;
  districts: readonly District[];
  editing?: boolean;
  noDistrictsCallout?: React.ReactNode;
  onChange: (districtIds: string[]) => void;
  value: string[];
}) {
  const { disabled, districts, editing, noDistrictsCallout, onChange, value } =
    props;

  const filteredDistricts = editing
    ? districts
    : districts.filter((d) => value.includes(d.id));

  return (
    <CheckboxGroup
      disabled={disabled}
      label="Districts"
      hideLabel
      noOptionsMessage={noDistrictsCallout}
      options={filteredDistricts.map((district) => ({
        value: district.id,
        label: district.name,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

function createBlankPrecinct(): Precinct {
  return {
    name: '',
    id: generateId(),
    districtIds: [],
  };
}

function PrimaryFormActions(props: { disabled?: boolean; editing?: boolean }) {
  const { disabled, editing } = props;

  if (!editing) {
    return (
      <Button icon="Edit" type="reset" variant="primary">
        Edit
      </Button>
    );
  }

  return (
    <React.Fragment>
      <Button disabled={disabled} type="reset">
        Cancel
      </Button>
      <Button type="submit" variant="primary" icon="Done" disabled={disabled}>
        Save
      </Button>
    </React.Fragment>
  );
}

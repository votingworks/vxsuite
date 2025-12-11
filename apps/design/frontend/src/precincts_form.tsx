import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';

import {
  Button,
  Callout,
  P,
  Card,
  CheckboxGroup,
  Modal,
} from '@votingworks/ui';
import {
  ElectionId,
  hasSplits,
  PrecinctSplit,
  Precinct,
} from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';

import { routes } from './routes';
import {
  Form,
  FormActionsRow,
  Row,
  Column,
  InputGroup,
  FieldName,
} from './layout';
import {
  listDistricts,
  getStateFeatures,
  updatePrecinct,
  createPrecinct,
  deletePrecinct,
} from './api';
import { generateId, replaceAtIndex } from './utils';
import { SealImageInput } from './seal_image_input';
import { SignatureImageInput } from './signature_image_input';

function createBlankPrecinct(): Precinct {
  return {
    name: '',
    id: generateId(),
    districtIds: [],
  };
}

export interface PrecinctFormProps {
  electionId: ElectionId;
  savedPrecinct?: Precinct;
}

export function PrecinctForm(props: PrecinctFormProps): React.ReactNode {
  const { electionId, savedPrecinct } = props;
  const getStateFeaturesQuery = getStateFeatures.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
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
  const precinctRoutes = routes.election(electionId).precincts;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  if (!(getStateFeaturesQuery.isSuccess && listDistrictsQuery.isSuccess)) {
    return null;
  }

  const features = getStateFeaturesQuery.data;
  const districts = listDistrictsQuery.data;

  function goBackToPrecinctsList() {
    history.push(precinctRoutes.root.path);
  }

  function onSubmit() {
    if (savedPrecinct) {
      updatePrecinctMutation.mutate(
        { electionId, updatedPrecinct: precinct },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToPrecinctsList();
            }
          },
        }
      );
    } else {
      createPrecinctMutation.mutate(
        { electionId, newPrecinct: precinct },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToPrecinctsList();
            }
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

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        goBackToPrecinctsList();
      }}
    >
      <InputGroup label="Name">
        <input
          type="text"
          value={precinct.name}
          onChange={(e) => setPrecinct({ ...precinct, name: e.target.value })}
          onBlur={(e) =>
            setPrecinct({ ...precinct, name: e.target.value.trim() })
          }
          autoComplete="off"
          required
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
                      <input
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
                    <CheckboxGroup
                      label="Districts"
                      noOptionsMessage={noDistrictsCallout}
                      options={districts.map((district) => ({
                        value: district.id,
                        label: district.name,
                      }))}
                      value={[...split.districtIds]}
                      onChange={(districtIds) =>
                        setSplit(index, {
                          ...split,
                          districtIds,
                        })
                      }
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
                    <Button
                      style={{ marginTop: 'auto' }}
                      onPress={() => onRemoveSplitPress(index)}
                    >
                      Remove Split
                    </Button>
                  </Column>
                </Card>
              ))}
              <div>
                <Button icon="Add" onPress={onAddSplitPress}>
                  Add Split
                </Button>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div style={{ minWidth: '12rem' }}>
                <CheckboxGroup
                  label="Districts"
                  hideLabel
                  noOptionsMessage={noDistrictsCallout}
                  options={districts.map((district) => ({
                    value: district.id,
                    label: district.name,
                  }))}
                  value={[...precinct.districtIds]}
                  onChange={(districtIds) =>
                    setPrecinct({
                      ...precinct,
                      districtIds,
                    })
                  }
                />
              </div>
              <div>
                <Button icon="Add" onPress={onAddSplitPress}>
                  Add Split
                </Button>
              </div>
            </React.Fragment>
          )}
        </Row>
      </div>
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
        {savedPrecinct && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={() => setIsConfirmingDelete(true)}
              disabled={someMutationIsLoading}
            >
              Delete Precinct
            </Button>
          </FormActionsRow>
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
                  variant="danger"
                  onPress={onDelete}
                  autoFocus
                  disabled={someMutationIsLoading}
                >
                  Delete Precinct
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

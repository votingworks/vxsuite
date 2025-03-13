import React, { useState } from 'react';
import {
  Button,
  Callout,
  Table,
  TH,
  TD,
  H1,
  LinkButton,
  P,
  Card,
  CheckboxGroup,
  MainContent,
  MainHeader,
  Breadcrumbs,
  TabPanel,
  RouterTabBar,
  Modal,
} from '@votingworks/ui';
import {
  Switch,
  Route,
  Redirect,
  useParams,
  useHistory,
} from 'react-router-dom';
import {
  District,
  DistrictId,
  ElectionId,
  hasSplits,
  PrecinctId,
  PrecinctSplit,
  SplittablePrecinct,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import styled from 'styled-components';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import {
  Form,
  NestedTr,
  TableActionsRow,
  FormActionsRow,
  Row,
  Column,
  InputGroup,
  FieldName,
} from './layout';
import {
  createDistrict,
  deleteDistrict,
  getBallotsFinalizedAt,
  listDistricts,
  getElection,
  getElectionFeatures,
  getUserFeatures,
  updateDistrict,
  listPrecincts,
  updatePrecinct,
  createPrecinct,
  deletePrecinct,
} from './api';
import { generateId, replaceAtIndex } from './utils';
import { ImageInput } from './image_input';
import { SealImageInput } from './seal_image_input';
import { useTitle } from './hooks/use_title';

function DistrictsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getUserFeaturesQuery = getUserFeatures.useQuery();

  /* istanbul ignore next - @preserve */
  if (
    !(
      listDistrictsQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess &&
      getUserFeaturesQuery.isSuccess
    )
  ) {
    return null;
  }

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const districts = listDistrictsQuery.data;
  const districtsRoutes = routes.election(electionId).geography.districts;
  const features = getUserFeaturesQuery.data;

  return (
    <TabPanel>
      {districts.length === 0 && (
        <P>You haven&apos;t added any districts to this election yet.</P>
      )}
      {features.CREATE_DELETE_DISTRICTS && (
        <TableActionsRow>
          <LinkButton
            icon="Add"
            variant="primary"
            to={districtsRoutes.addDistrict.path}
            disabled={!!ballotsFinalizedAt}
          >
            Add District
          </LinkButton>
        </TableActionsRow>
      )}
      {districts.length > 0 && (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {districts.map((district) => (
              <tr key={district.id}>
                <TD>{district.name}</TD>
                <TD>
                  <LinkButton
                    icon="Edit"
                    to={districtsRoutes.editDistrict(district.id).path}
                    disabled={!!ballotsFinalizedAt}
                  >
                    Edit
                  </LinkButton>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TabPanel>
  );
}

function createBlankDistrict(): District {
  return {
    id: generateId() as DistrictId,
    name: '',
  };
}

function DistrictForm({
  electionId,
  districtId,
  savedDistricts,
}: {
  electionId: ElectionId;
  districtId?: DistrictId;
  savedDistricts: readonly District[];
}): JSX.Element | null {
  const [district, setDistrict] = useState<District | undefined>(
    districtId
      ? savedDistricts.find((d) => d.id === districtId)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankDistrict
  );
  const updateDistrictMutation = updateDistrict.useMutation();
  const createDistrictMutation = createDistrict.useMutation();
  const deleteDistrictMutation = deleteDistrict.useMutation();
  const history = useHistory();
  const geographyRoutes = routes.election(electionId).geography;
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

  // After deleting a district, this component may re-render briefly with no
  // district before redirecting to the districts list. We can just render
  // nothing in that case.
  /* istanbul ignore next - @preserve */
  if (!district) {
    return null;
  }

  function goBackToDistrictsList() {
    history.push(geographyRoutes.districts.root.path);
  }

  function onSubmit(formDistrict: District) {
    if (districtId) {
      updateDistrictMutation.mutate(
        { electionId, updatedDistrict: formDistrict },
        { onSuccess: goBackToDistrictsList }
      );
    } else {
      createDistrictMutation.mutate(
        { electionId, newDistrict: formDistrict },
        { onSuccess: goBackToDistrictsList }
      );
    }
  }

  function onDelete(districtIdToDelete: DistrictId) {
    deleteDistrictMutation.mutate(
      { electionId, districtId: districtIdToDelete },
      { onSuccess: goBackToDistrictsList }
    );
  }

  const someMutationIsLoading =
    createDistrictMutation.isLoading ||
    updateDistrictMutation.isLoading ||
    deleteDistrictMutation.isLoading;

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(district);
      }}
      onReset={(e) => {
        e.preventDefault();
        goBackToDistrictsList();
      }}
    >
      <InputGroup label="Name">
        <input
          type="text"
          value={district.name}
          onChange={(e) => setDistrict({ ...district, name: e.target.value })}
          onBlur={(e) =>
            setDistrict({ ...district, name: e.target.value.trim() })
          }
          autoComplete="off"
          required
        />
      </InputGroup>
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
        {features.CREATE_DELETE_DISTRICTS && districtId && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={() => setIsConfirmingDelete(true)}
              disabled={someMutationIsLoading}
            >
              Delete District
            </Button>
          </FormActionsRow>
        )}
        {districtId && isConfirmingDelete && (
          <Modal
            title="Delete District"
            content={
              <div>
                <P>
                  Are you sure you want to delete this district? This action
                  cannot be undone.
                </P>
              </div>
            }
            actions={
              <React.Fragment>
                <Button
                  variant="danger"
                  onPress={() => onDelete(district.id)}
                  autoFocus
                  disabled={someMutationIsLoading}
                >
                  Delete District
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

function AddDistrictForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const geographyRoutes = routes.election(electionId).geography;

  /* istanbul ignore next - @preserve */
  if (!listDistrictsQuery.isSuccess) {
    return null;
  }

  const districts = listDistrictsQuery.data;
  const { title } = geographyRoutes.districts.addDistrict;

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[geographyRoutes.districts.root]}
        />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <DistrictForm electionId={electionId} savedDistricts={districts} />
      </MainContent>
    </React.Fragment>
  );
}

function EditDistrictForm(): JSX.Element | null {
  const { electionId, districtId } = useParams<
    ElectionIdParams & { districtId: DistrictId }
  >();
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const geographyRoutes = routes.election(electionId).geography;

  /* istanbul ignore next - @preserve */
  if (!listDistrictsQuery.isSuccess) {
    return null;
  }

  const districts = listDistrictsQuery.data;
  const { title } = geographyRoutes.districts.editDistrict(districtId);

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[geographyRoutes.districts.root]}
        />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <DistrictForm
          electionId={electionId}
          districtId={districtId}
          savedDistricts={districts}
        />
      </MainContent>
    </React.Fragment>
  );
}

function PrecinctsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const geographyRoutes = routes.election(electionId).geography;
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getUserFeaturesQuery = getUserFeatures.useQuery();

  /* istanbul ignore next - @preserve */
  if (
    !(
      listPrecinctsQuery.isSuccess &&
      listDistrictsQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess &&
      getUserFeaturesQuery.isSuccess
    )
  ) {
    return null;
  }

  const precincts = listPrecinctsQuery.data;
  const districts = listDistrictsQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const features = getUserFeaturesQuery.data;

  const districtIdToName = new Map(
    districts.map((district) => [district.id, district.name])
  );

  return (
    <TabPanel>
      {precincts.length === 0 && (
        <P>You haven&apos;t added any precincts to this election yet.</P>
      )}
      {features.CREATE_DELETE_PRECINCTS && (
        <TableActionsRow>
          <LinkButton
            variant="primary"
            icon="Add"
            to={geographyRoutes.precincts.addPrecinct.path}
            disabled={!!ballotsFinalizedAt}
          >
            Add Precinct
          </LinkButton>
        </TableActionsRow>
      )}
      {precincts.length > 0 && (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH>Districts</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {precincts.flatMap((precinct) => {
              const precinctRow = (
                <tr key={precinct.id}>
                  <TD>{precinct.name}</TD>
                  <TD>
                    {'districtIds' in precinct &&
                      precinct.districtIds
                        .map((districtId) => districtIdToName.get(districtId))
                        .join(', ')}
                  </TD>
                  <TD>
                    <LinkButton
                      icon="Edit"
                      to={
                        geographyRoutes.precincts.editPrecinct(precinct.id).path
                      }
                      disabled={!!ballotsFinalizedAt}
                    >
                      Edit
                    </LinkButton>
                  </TD>
                </tr>
              );
              if (!hasSplits(precinct)) {
                return [precinctRow];
              }

              const splitRows = precinct.splits.map((split) => (
                <NestedTr key={split.id}>
                  <TD>{split.name}</TD>
                  <TD>
                    {split.districtIds
                      .map((districtId) => districtIdToName.get(districtId))
                      .join(', ')}
                  </TD>
                  <TD />
                </NestedTr>
              ));
              return [precinctRow, ...splitRows];
            })}
          </tbody>
        </Table>
      )}
    </TabPanel>
  );
}

function createBlankPrecinct(): SplittablePrecinct {
  return {
    name: '',
    id: generateId(),
    districtIds: [],
  };
}

const ClerkSignatureImageInput = styled(ImageInput)`
  img {
    height: 3rem;
  }
`;

function PrecinctForm({
  electionId,
  precinctId,
  savedPrecincts,
}: {
  electionId: ElectionId;
  precinctId?: PrecinctId;
  savedPrecincts: SplittablePrecinct[];
}): JSX.Element | null {
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const getElectionFeaturesQuery = getElectionFeatures.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const [precinct, setPrecinct] = useState<SplittablePrecinct | undefined>(
    precinctId
      ? savedPrecincts.find((p) => p.id === precinctId)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankPrecinct
  );
  const createPrecinctMutation = createPrecinct.useMutation();
  const updatePrecinctMutation = updatePrecinct.useMutation();
  const deletePrecinctMutation = deletePrecinct.useMutation();
  const history = useHistory();
  const geographyRoutes = routes.election(electionId).geography;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  /* istanbul ignore next - @preserve */
  if (
    !(
      getUserFeaturesQuery.isSuccess &&
      getElectionFeaturesQuery.isSuccess &&
      listDistrictsQuery.isSuccess
    )
  ) {
    return null;
  }

  const userFeatures = getUserFeaturesQuery.data;
  const electionFeatures = getElectionFeaturesQuery.data;
  const districts = listDistrictsQuery.data;

  // After deleting a precinct, this component may re-render briefly with no
  // precinct before redirecting to the precincts list. We can just render
  // nothing in that case.
  /* istanbul ignore next - @preserve */
  if (!precinct) {
    return null;
  }

  function goBackToPrecinctsList() {
    history.push(geographyRoutes.precincts.root.path);
  }

  function onSubmit(formPrecinct: SplittablePrecinct) {
    if (precinctId) {
      updatePrecinctMutation.mutate(
        { electionId, updatedPrecinct: formPrecinct },
        { onSuccess: goBackToPrecinctsList }
      );
    } else {
      createPrecinctMutation.mutate(
        { electionId, newPrecinct: formPrecinct },
        { onSuccess: goBackToPrecinctsList }
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

  function onDelete(id: PrecinctId) {
    deletePrecinctMutation.mutate(
      { electionId, precinctId: id },
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

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(precinct);
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
                        disabled={!userFeatures.CREATE_DELETE_PRECINCT_SPLITS}
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
                          districtIds: districtIds as DistrictId[],
                        })
                      }
                      disabled={!userFeatures.CREATE_DELETE_PRECINCT_SPLITS}
                    />

                    {electionFeatures.PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE && (
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

                    {electionFeatures.PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE && (
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

                    {electionFeatures.PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE && (
                      <div>
                        <FieldName>Signature Image</FieldName>
                        <ClerkSignatureImageInput
                          value={split.clerkSignatureImage}
                          onChange={(value) =>
                            setSplit(index, {
                              ...split,
                              clerkSignatureImage: value,
                            })
                          }
                          buttonLabel="Upload Signature Image"
                          removeButtonLabel="Remove Signature Image"
                          minHeightPx={50}
                          minWidthPx={100}
                        />
                      </div>
                    )}

                    {electionFeatures.PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION && (
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

                    {userFeatures.CREATE_DELETE_PRECINCT_SPLITS && (
                      <Button
                        style={{ marginTop: 'auto' }}
                        onPress={() => onRemoveSplitPress(index)}
                      >
                        Remove Split
                      </Button>
                    )}
                  </Column>
                </Card>
              ))}
              {userFeatures.CREATE_DELETE_PRECINCT_SPLITS && (
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
                      districtIds: districtIds as DistrictId[],
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
        {precinctId && userFeatures.CREATE_DELETE_PRECINCTS && (
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
        {precinctId && isConfirmingDelete && (
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
                  onPress={() => onDelete(precinctId)}
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

function AddPrecinctForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const geographyRoutes = routes.election(electionId).geography;

  /* istanbul ignore next - @preserve */
  if (!listPrecinctsQuery.isSuccess) {
    return null;
  }

  const precincts = listPrecinctsQuery.data;
  const { title } = geographyRoutes.precincts.addPrecinct;

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[geographyRoutes.districts.root]}
        />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <PrecinctForm electionId={electionId} savedPrecincts={precincts} />
      </MainContent>
    </React.Fragment>
  );
}

function EditPrecinctForm(): JSX.Element | null {
  const { electionId, precinctId } = useParams<
    ElectionIdParams & { precinctId: string }
  >();
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const geographyRoutes = routes.election(electionId).geography;

  /* istanbul ignore next - @preserve */
  if (!listPrecinctsQuery.isSuccess) {
    return null;
  }

  const precincts = listPrecinctsQuery.data;
  const { title } = geographyRoutes.precincts.editPrecinct(precinctId);

  return (
    <React.Fragment>
      <MainHeader>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[geographyRoutes.districts.root]}
        />
        <H1>{title}</H1>
      </MainHeader>
      <MainContent>
        <PrecinctForm
          electionId={electionId}
          precinctId={precinctId}
          savedPrecincts={precincts}
        />
      </MainContent>
    </React.Fragment>
  );
}

export function GeographyScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const geographyParamRoutes = electionParamRoutes.geography;
  const geographyRoutes = routes.election(electionId).geography;
  const getElectionQuery = getElection.useQuery(electionId);
  useTitle(
    routes.election(electionId).geography.root.title,
    getElectionQuery.data?.election.title
  );

  return (
    <ElectionNavScreen electionId={electionId}>
      <Switch>
        <Route
          path={geographyParamRoutes.districts.addDistrict.path}
          exact
          component={AddDistrictForm}
        />
        <Route
          path={geographyParamRoutes.districts.editDistrict(':districtId').path}
          exact
          component={EditDistrictForm}
        />
        <Route
          path={geographyParamRoutes.precincts.addPrecinct.path}
          exact
          component={AddPrecinctForm}
        />
        <Route
          path={geographyParamRoutes.precincts.editPrecinct(':precinctId').path}
          exact
          component={EditPrecinctForm}
        />
        <Route path={geographyParamRoutes.root.path}>
          <MainHeader>
            <H1>Geography</H1>
          </MainHeader>
          <MainContent>
            <RouterTabBar
              tabs={[
                geographyRoutes.districts.root,
                geographyRoutes.precincts.root,
              ]}
            />
            <Switch>
              <Route
                path={geographyParamRoutes.districts.root.path}
                component={DistrictsTab}
              />
              <Route
                path={geographyParamRoutes.precincts.root.path}
                component={PrecinctsTab}
              />
              <Redirect
                from={geographyParamRoutes.root.path}
                to={geographyParamRoutes.districts.root.path}
              />
            </Switch>
          </MainContent>
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}

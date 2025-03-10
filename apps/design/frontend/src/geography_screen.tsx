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
  Election,
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
  getBallotsFinalizedAt,
  getElection,
  updateElection,
  updatePrecincts,
} from './api';
import { generateId, replaceAtIndex } from './utils';
import { ImageInput } from './image_input';
import { useElectionFeatures, useUserFeatures } from './features_context';
import { SealImageInput } from './seal_image_input';
import { useTitle } from './hooks/use_title';

function DistrictsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const features = useUserFeatures();

  if (!getElectionQuery.isSuccess || !getBallotsFinalizedAtQuery.isSuccess) {
    return null;
  }

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const {
    election: { districts },
  } = getElectionQuery.data;
  const districtsRoutes = routes.election(electionId).geography.districts;

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
  savedElection,
  savedPrecincts,
}: {
  electionId: ElectionId;
  districtId?: string;
  savedElection: Election;
  savedPrecincts?: SplittablePrecinct[];
}): JSX.Element | null {
  const savedDistricts = savedElection.districts;
  const [district, setDistrict] = useState<District | undefined>(
    districtId
      ? savedDistricts.find((d) => d.id === districtId)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankDistrict
  );
  const updateElectionMutation = updateElection.useMutation();
  const updatePrecinctsMutation = updatePrecincts.useMutation();
  const history = useHistory();
  const geographyRoutes = routes.election(electionId).geography;
  const features = useUserFeatures();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // After deleting a district, this component may re-render briefly with no
  // district before redirecting to the districts list. We can just render
  // nothing in that case.
  if (!district) {
    return null;
  }

  function onSubmit(updatedDistrict: District) {
    const newDistricts = districtId
      ? savedElection.districts.map((d) =>
          d.id === districtId ? updatedDistrict : d
        )
      : [...savedDistricts, updatedDistrict];
    updateElectionMutation.mutate(
      {
        electionId,
        election: {
          ...savedElection,
          districts: newDistricts,
        },
      },
      {
        onSuccess: () => {
          history.push(geographyRoutes.districts.root.path);
        },
      }
    );
  }

  function onReset() {
    history.push(geographyRoutes.districts.root.path);
  }

  function onDeletePress() {
    setIsConfirmingDelete(true);
  }

  function onConfirmDeletePress(districtIdToRemove: DistrictId) {
    assert(savedPrecincts !== undefined);
    const newDistricts = savedDistricts.filter(
      (d) => d.id !== districtIdToRemove
    );
    // When deleting a district, we need to remove it from any precincts that
    // reference it
    updatePrecinctsMutation.mutate(
      {
        electionId,
        precincts: savedPrecincts.map((precinct) => {
          if (hasSplits(precinct)) {
            return {
              ...precinct,
              splits: precinct.splits.map((split) => ({
                ...split,
                districtIds: split.districtIds.filter(
                  (id) => id !== districtIdToRemove
                ),
              })),
            };
          }
          return {
            ...precinct,
            districtIds: precinct.districtIds.filter(
              (id) => id !== districtIdToRemove
            ),
          };
        }),
      },
      {
        onSuccess: () => {
          updateElectionMutation.mutate(
            {
              electionId,
              election: {
                ...savedElection,
                districts: newDistricts,
              },
            },
            {
              onSuccess: () => {
                history.push(geographyRoutes.districts.root.path);
              },
            }
          );
        },
      }
    );
  }

  function onCancelDelete() {
    setIsConfirmingDelete(false);
  }

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(district);
      }}
      onReset={(e) => {
        e.preventDefault();
        onReset();
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
            disabled={updateElectionMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
        {features.CREATE_DELETE_DISTRICTS && districtId && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={onDeletePress}
              disabled={updateElectionMutation.isLoading}
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
                  onPress={() => onConfirmDeletePress(district.id)}
                  autoFocus
                >
                  Delete District
                </Button>
                <Button onPress={onCancelDelete}>Cancel</Button>
              </React.Fragment>
            }
            onOverlayClick={onCancelDelete}
          />
        )}
      </div>
    </Form>
  );
}

function AddDistrictForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);
  const geographyRoutes = routes.election(electionId).geography;

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election } = getElectionQuery.data;
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
        <DistrictForm electionId={electionId} savedElection={election} />
      </MainContent>
    </React.Fragment>
  );
}

function EditDistrictForm(): JSX.Element | null {
  const { electionId, districtId } = useParams<
    ElectionIdParams & { districtId: string }
  >();
  const getElectionQuery = getElection.useQuery(electionId);
  const geographyRoutes = routes.election(electionId).geography;

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { election, precincts } = getElectionQuery.data;
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
          savedElection={election}
          savedPrecincts={precincts}
        />
      </MainContent>
    </React.Fragment>
  );
}

function PrecinctsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const geographyRoutes = routes.election(electionId).geography;
  const getElectionQuery = getElection.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const features = useUserFeatures();

  if (!getElectionQuery.isSuccess || !getBallotsFinalizedAtQuery.isSuccess) {
    return null;
  }

  const { precincts, election } = getElectionQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;

  const districtIdToName = new Map(
    election.districts.map((district) => [district.id, district.name])
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
  districts,
}: {
  electionId: ElectionId;
  precinctId?: PrecinctId;
  savedPrecincts: SplittablePrecinct[];
  districts: readonly District[];
}): JSX.Element | null {
  const userFeatures = useUserFeatures();
  const electionFeatures = useElectionFeatures();
  const [precinct, setPrecinct] = useState<SplittablePrecinct | undefined>(
    precinctId
      ? savedPrecincts.find((p) => p.id === precinctId)
      : // To make mocked IDs predictable in tests, we pass a function here
        // so it will only be called on initial render.
        createBlankPrecinct
  );
  const updatePrecinctsMutation = updatePrecincts.useMutation();
  const history = useHistory();
  const geographyRoutes = routes.election(electionId).geography;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // After deleting a precinct, this component may re-render briefly with no
  // precinct before redirecting to the precincts list. We can just render
  // nothing in that case.
  if (!precinct) {
    return null;
  }

  function onSubmit(updatedPrecinct: SplittablePrecinct) {
    const newPrecincts = precinctId
      ? savedPrecincts.map((p) => (p.id === precinctId ? updatedPrecinct : p))
      : [...savedPrecincts, updatedPrecinct];
    updatePrecinctsMutation.mutate(
      {
        electionId,
        precincts: newPrecincts,
      },
      {
        onSuccess: () => {
          history.push(geographyRoutes.precincts.root.path);
        },
      }
    );
  }

  function onReset() {
    history.push(geographyRoutes.precincts.root.path);
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

  function onDeletePress() {
    setIsConfirmingDelete(true);
  }

  function onCancelDelete() {
    setIsConfirmingDelete(false);
  }

  function onConfirmDeletePress(id: PrecinctId) {
    const newPrecincts = savedPrecincts.filter((p) => p.id !== id);
    updatePrecinctsMutation.mutate(
      {
        electionId,
        precincts: newPrecincts,
      },
      {
        onSuccess: () => {
          history.push(geographyRoutes.precincts.root.path);
        },
      }
    );
  }

  const noDistrictsCallout = (
    <Callout icon="Warning" color="warning">
      No districts yet.
    </Callout>
  );

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(precinct);
      }}
      onReset={(e) => {
        e.preventDefault();
        onReset();
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
            disabled={updatePrecinctsMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
        {precinctId && userFeatures.CREATE_DELETE_PRECINCTS && (
          <FormActionsRow style={{ marginTop: '1rem' }}>
            <Button
              variant="danger"
              icon="Delete"
              onPress={onDeletePress}
              disabled={updatePrecinctsMutation.isLoading}
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
                  onPress={() => onConfirmDeletePress(precinctId)}
                  autoFocus
                >
                  Delete Precinct
                </Button>
                <Button onPress={onCancelDelete}>Cancel</Button>
              </React.Fragment>
            }
            onOverlayClick={onCancelDelete}
          />
        )}
      </div>
    </Form>
  );
}

function AddPrecinctForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);
  const geographyRoutes = routes.election(electionId).geography;

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { precincts, election } = getElectionQuery.data;
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
        <PrecinctForm
          electionId={electionId}
          savedPrecincts={precincts}
          districts={election.districts}
        />
      </MainContent>
    </React.Fragment>
  );
}

function EditPrecinctForm(): JSX.Element | null {
  const { electionId, precinctId } = useParams<
    ElectionIdParams & { precinctId: string }
  >();
  const getElectionQuery = getElection.useQuery(electionId);
  const geographyRoutes = routes.election(electionId).geography;

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { precincts, election } = getElectionQuery.data;
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
          districts={election.districts}
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

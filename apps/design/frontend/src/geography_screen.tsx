import React, { useState } from 'react';
import {
  Button,
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
  Id,
  PrecinctId,
} from '@votingworks/types';
import { assert, find, iter } from '@votingworks/basics';
import type { Precinct } from '@votingworks/design-backend';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { TabPanel, TabBar } from './tabs';
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
import { getElection, updateElection, updatePrecincts } from './api';
import { hasSplits, nextId, replaceAtIndex } from './utils';

function DistrictsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const {
    election: { districts },
  } = getElectionQuery.data;
  const districtsRoutes = routes.election(electionId).geography.districts;

  return (
    <TabPanel>
      {districts.length === 0 && (
        <P>You haven&apos;t added any districts to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton
          icon="Add"
          variant="primary"
          to={districtsRoutes.addDistrict.path}
        >
          Add District
        </LinkButton>
      </TableActionsRow>
      {districts.length > 0 && (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH>ID</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {districts.map((district) => (
              <tr key={district.id}>
                <TD>{district.name}</TD>
                <TD>{district.id}</TD>
                <TD>
                  <LinkButton
                    icon="Edit"
                    to={districtsRoutes.editDistrict(district.id).path}
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

function createBlankDistrict(id: string): District {
  return {
    name: '',
    id: id as DistrictId,
  };
}

function DistrictForm({
  electionId,
  districtId,
  savedElection,
  savedPrecincts,
}: {
  electionId: Id;
  districtId?: string;
  savedElection: Election;
  savedPrecincts?: Precinct[];
}): JSX.Element {
  const savedDistricts = savedElection.districts;
  const savedDistrict = districtId
    ? find(savedDistricts, (d) => d.id === districtId)
    : createBlankDistrict(
        nextId(
          'district-',
          savedDistricts.map((d) => d.id)
        )
      );
  const [district, setDistrict] = useState<District>(savedDistrict);
  const updateElectionMutation = updateElection.useMutation();
  const updatePrecinctsMutation = updatePrecincts.useMutation();
  const history = useHistory();
  const geographyRoutes = routes.election(electionId).geography;

  function onSavePress() {
    const newDistricts = districtId
      ? savedElection.districts.map((d) => (d.id === districtId ? district : d))
      : [...savedDistricts, district];
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

  function onDeletePress() {
    assert(districtId !== undefined);
    assert(savedPrecincts !== undefined);
    const newDistricts = savedDistricts.filter((d) => d.id !== districtId);
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
                  (id) => id !== districtId
                ),
              })),
            };
          }
          return {
            ...precinct,
            districtIds: precinct.districtIds.filter((id) => id !== districtId),
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

  return (
    <Form>
      <InputGroup label="Name">
        <input
          type="text"
          value={district.name}
          onChange={(e) => setDistrict({ ...district, name: e.target.value })}
        />
      </InputGroup>
      <InputGroup label="ID">
        <input
          type="text"
          value={district.id}
          onChange={(e) =>
            setDistrict({ ...district, id: e.target.value as DistrictId })
          }
        />
      </InputGroup>
      <div>
        <FormActionsRow>
          <LinkButton to={geographyRoutes.districts.root.path}>
            Cancel
          </LinkButton>
          <Button
            variant="primary"
            icon="Done"
            onPress={onSavePress}
            disabled={updateElectionMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
        {districtId && (
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

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { precincts, election } = getElectionQuery.data;

  const districtIdToName = new Map(
    election.districts.map((district) => [district.id, district.name])
  );

  return (
    <TabPanel>
      {precincts.length === 0 && (
        <P>You haven&apos;t added any precincts to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton
          variant="primary"
          icon="Add"
          to={geographyRoutes.precincts.addPrecinct.path}
        >
          Add Precinct
        </LinkButton>
      </TableActionsRow>
      {precincts.length > 0 && (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH>ID</TH>
              <TH>Districts</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {precincts.flatMap((precinct) => {
              const precinctRow = (
                <tr key={precinct.id}>
                  <TD>{precinct.name}</TD>
                  <TD>{precinct.id}</TD>
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
                  <TD>{split.id}</TD>
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

function createBlankPrecinct(id: string): Precinct {
  return {
    name: '',
    id,
    districtIds: [],
  };
}

function PrecinctForm({
  electionId,
  precinctId,
  savedPrecincts,
  districts,
}: {
  electionId: Id;
  precinctId?: PrecinctId;
  savedPrecincts: Precinct[];
  districts: readonly District[];
}): JSX.Element {
  const savedPrecinct = precinctId
    ? find(savedPrecincts, (p) => p.id === precinctId)
    : createBlankPrecinct(
        nextId(
          'precinct-',
          savedPrecincts.map((p) => p.id)
        )
      );
  const [precinct, setPrecinct] = useState<Precinct>(savedPrecinct);
  const updatePrecinctsMutation = updatePrecincts.useMutation();
  const history = useHistory();
  const geographyRoutes = routes.election(electionId).geography;

  function onSavePress() {
    const newPrecincts = precinctId
      ? savedPrecincts.map((p) => (p.id === precinctId ? precinct : p))
      : [...savedPrecincts, precinct];
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

  function onAddSplitPress() {
    if (hasSplits(precinct)) {
      const { id, name, splits } = precinct;
      const nextSplitId = nextId(
        `${id}-split-`,
        splits.map((split) => split.id)
      );
      const nextSplitNum = iter(nextSplitId.split('-')).last();
      setPrecinct({
        id,
        name,
        splits: [
          ...splits,
          {
            id: nextSplitId,
            name: `${name} - Split ${nextSplitNum}`,
            districtIds: [],
          },
        ],
      });
    } else {
      const { id, name, districtIds } = precinct;
      setPrecinct({
        id,
        name,
        splits: [
          {
            id: `${id}-split-1`,
            name: `${name} - Split 1`,
            districtIds,
          },
          {
            id: `${id}-split-2`,
            name: `${name} - Split 2`,
            districtIds: [],
          },
        ],
      });
    }
  }

  function onRemoveSplitPress(index: number) {
    assert(hasSplits(precinct));
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
        districtIds: splits[0].districtIds,
      });
    }
  }

  function onDeletePress() {
    assert(precinctId !== undefined);
    const newPrecincts = savedPrecincts.filter((p) => p.id !== precinctId);
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

  return (
    <Form>
      <InputGroup label="Name">
        <input
          type="text"
          value={precinct.name}
          onChange={(e) => setPrecinct({ ...precinct, name: e.target.value })}
        />
      </InputGroup>
      <InputGroup label="ID">
        <input
          type="text"
          value={precinct.id}
          onChange={(e) => setPrecinct({ ...precinct, id: e.target.value })}
        />
      </InputGroup>
      <div>
        <FieldName>Districts</FieldName>
        <Row style={{ gap: '1rem', flexWrap: 'wrap' }}>
          {hasSplits(precinct) ? (
            <React.Fragment>
              {precinct.splits.map((split, index) => (
                // Because we want to be able to edit the ID, we can't use it as a key
                // eslint-disable-next-line react/no-array-index-key
                <Card key={`split-${index}`}>
                  <Column style={{ gap: '1rem' }}>
                    <InputGroup label="Name">
                      <input
                        type="text"
                        value={split.name}
                        onChange={(e) =>
                          setPrecinct({
                            ...precinct,
                            splits: replaceAtIndex(precinct.splits, index, {
                              ...split,
                              name: e.target.value,
                            }),
                          })
                        }
                      />
                    </InputGroup>
                    <InputGroup label="ID">
                      <input
                        type="text"
                        value={split.id}
                        onChange={(e) =>
                          setPrecinct({
                            ...precinct,
                            splits: replaceAtIndex(precinct.splits, index, {
                              ...split,
                              id: e.target.value,
                            }),
                          })
                        }
                      />
                    </InputGroup>
                    <CheckboxGroup
                      label="Districts"
                      options={districts.map((district) => ({
                        value: district.id,
                        label: district.name,
                      }))}
                      value={[...split.districtIds]}
                      onChange={(districtIds) =>
                        setPrecinct({
                          ...precinct,
                          splits: replaceAtIndex(precinct.splits, index, {
                            ...split,
                            districtIds: districtIds as DistrictId[],
                          }),
                        })
                      }
                    />
                    <Button onPress={() => onRemoveSplitPress(index)}>
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
          <LinkButton to={geographyRoutes.precincts.root.path}>
            Cancel
          </LinkButton>
          <Button
            variant="primary"
            icon="Done"
            onPress={onSavePress}
            disabled={updatePrecinctsMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
        {precinctId && (
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
            <TabBar
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

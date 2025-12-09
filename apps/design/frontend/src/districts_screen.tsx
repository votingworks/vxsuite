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
  MainContent,
  Breadcrumbs,
  Modal,
} from '@votingworks/ui';
import { Switch, Route, useParams, useHistory } from 'react-router-dom';

import { District, DistrictId, ElectionId } from '@votingworks/types';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';

import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { Form, TableActionsRow, FormActionsRow, InputGroup } from './layout';
import {
  createDistrict,
  deleteDistrict,
  getBallotsFinalizedAt,
  listDistricts,
  updateDistrict,
} from './api';
import { generateId } from './utils';
import { useTitle } from './hooks/use_title';

export function DistrictsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const districtParamRoutes = electionParamRoutes.districts;
  useTitle(routes.election(electionId).districts.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Switch>
        <Route
          path={districtParamRoutes.add.path}
          exact
          component={AddDistrictForm}
        />
        <Route
          path={districtParamRoutes.edit(':districtId').path}
          exact
          component={EditDistrictForm}
        />
        <Route path={districtParamRoutes.root.path}>
          <Header>
            <H1>Districts</H1>
          </Header>
          <MainContent>
            <Contents />
          </MainContent>
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}

function Contents(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (!(listDistrictsQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)) {
    return null;
  }

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const districts = listDistrictsQuery.data;
  const districtsRoutes = routes.election(electionId).districts;

  return (
    <React.Fragment>
      {districts.length === 0 && (
        <P>You haven&apos;t added any districts to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton
          icon="Add"
          variant="primary"
          to={districtsRoutes.add.path}
          disabled={!!ballotsFinalizedAt}
        >
          Add District
        </LinkButton>
      </TableActionsRow>
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
                    to={districtsRoutes.edit(district.id).path}
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
    </React.Fragment>
  );
}

function createBlankDistrict(): District {
  return {
    id: generateId(),
    name: '',
  };
}

function DistrictForm({
  electionId,
  savedDistrict,
}: {
  electionId: ElectionId;
  savedDistrict?: District;
}): JSX.Element | null {
  const [district, setDistrict] = useState<District>(
    savedDistrict ??
      // To make mocked IDs predictable in tests, we pass a function here
      // so it will only be called on initial render.
      createBlankDistrict
  );
  const updateDistrictMutation = updateDistrict.useMutation();
  const createDistrictMutation = createDistrict.useMutation();
  const deleteDistrictMutation = deleteDistrict.useMutation();
  const history = useHistory();
  const districtRoutes = routes.election(electionId).districts;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function goBackToDistrictsList() {
    history.push(districtRoutes.root.path);
  }

  function onSubmit() {
    if (savedDistrict) {
      updateDistrictMutation.mutate(
        { electionId, updatedDistrict: district },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToDistrictsList();
            }
          },
        }
      );
    } else {
      createDistrictMutation.mutate(
        { electionId, newDistrict: district },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToDistrictsList();
            }
          },
        }
      );
    }
  }

  function onDelete() {
    deleteDistrictMutation.mutate(
      { electionId, districtId: assertDefined(savedDistrict).id },
      { onSuccess: goBackToDistrictsList }
    );
  }

  const someMutationIsLoading =
    createDistrictMutation.isLoading ||
    updateDistrictMutation.isLoading ||
    deleteDistrictMutation.isLoading;

  const errorMessage = (() => {
    if (
      createDistrictMutation.data?.isErr() ||
      updateDistrictMutation.data?.isErr()
    ) {
      const error = assertDefined(
        createDistrictMutation.data?.err() || updateDistrictMutation.data?.err()
      );
      /* istanbul ignore next - @preserve */
      if (error !== 'duplicate-name') throwIllegalValue(error);
      return (
        <Callout icon="Danger" color="danger">
          There is already a district with the same name.
        </Callout>
      );
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
        {savedDistrict && (
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
        {savedDistrict && isConfirmingDelete && (
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
                  onPress={onDelete}
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
  const districtRoutes = routes.election(electionId).districts;
  const { title } = districtRoutes.add;

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[districtRoutes.root]}
        />
        <H1>{title}</H1>
      </Header>
      <MainContent>
        <DistrictForm electionId={electionId} />
      </MainContent>
    </React.Fragment>
  );
}

function EditDistrictForm(): JSX.Element | null {
  const { electionId, districtId } = useParams<
    ElectionIdParams & { districtId: DistrictId }
  >();
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const districtRoutes = routes.election(electionId).districts;

  if (!listDistrictsQuery.isSuccess) {
    return null;
  }

  const districts = listDistrictsQuery.data;
  const savedDistrict = districts.find((d) => d.id === districtId);
  const { title } = districtRoutes.edit(districtId);

  // If the district was just deleted, this form may still render momentarily.
  // Ignore it.
  /* istanbul ignore next - @preserve */
  if (!savedDistrict) {
    return null;
  }

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[districtRoutes.root]}
        />
        <H1>{title}</H1>
      </Header>
      <MainContent>
        <DistrictForm electionId={electionId} savedDistrict={savedDistrict} />
      </MainContent>
    </React.Fragment>
  );
}

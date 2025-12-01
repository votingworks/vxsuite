import React, { useState } from 'react';
import {
  Table,
  TH,
  TD,
  LinkButton,
  P,
  Breadcrumbs,
  H1,
  MainContent,
  Button,
  Modal,
  Callout,
} from '@votingworks/ui';
import { Route, Switch, useParams, useHistory } from 'react-router-dom';
import { ElectionId, Party } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { TableActionsRow, Form, FormActionsRow, InputGroup } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import {
  getBallotsFinalizedAt,
  listParties,
  createParty,
  deleteParty,
  updateParty,
} from './api';
import { useTitle } from './hooks/use_title';
import { generateId } from './utils';

export function PartiesScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const partyParamRoutes = electionParamRoutes.parties;

  useTitle(routes.election(electionId).parties.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Switch>
        <Route
          path={partyParamRoutes.addParty.path}
          exact
          component={AddPartyForm}
        />
        <Route
          path={partyParamRoutes.editParty(':partyId').path}
          exact
          component={EditPartyForm}
        />
        <Route path={partyParamRoutes.root.path}>
          <Header>
            <H1>Parties</H1>
          </Header>
          <MainContent>
            <PartyList />
          </MainContent>
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}

export function PartyList(): React.ReactNode {
  const { electionId } = useParams<ElectionIdParams>();
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  /* istanbul ignore next - @preserve */
  if (!(listPartiesQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)) {
    return null;
  }

  const parties = listPartiesQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const partyRoutes = routes.election(electionId).parties;

  return (
    <React.Fragment>
      {parties.length === 0 && (
        <P>You haven&apos;t added any parties to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton
          icon="Add"
          variant="primary"
          to={partyRoutes.addParty.path}
          disabled={!!ballotsFinalizedAt}
        >
          Add Party
        </LinkButton>
      </TableActionsRow>
      {parties.length > 0 && (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH>Abbreviation</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {parties.map((party) => (
              <tr key={party.id}>
                <TD>{party.fullName}</TD>
                <TD>{party.abbrev}</TD>
                <TD>
                  <LinkButton
                    icon="Edit"
                    to={partyRoutes.editParty(party.id).path}
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

function AddPartyForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const partyRoutes = routes.election(electionId).parties;
  const { title } = partyRoutes.addParty;

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs currentTitle={title} parentRoutes={[partyRoutes.root]} />
        <H1>{title}</H1>
      </Header>
      <MainContent>
        <PartyForm electionId={electionId} />
      </MainContent>
    </React.Fragment>
  );
}

function EditPartyForm(): JSX.Element | null {
  const { electionId, partyId } = useParams<
    ElectionIdParams & { partyId: string }
  >();
  const listPartiesQuery = listParties.useQuery(electionId);
  const partyRoutes = routes.election(electionId).parties;

  /* istanbul ignore next - @preserve */
  if (!listPartiesQuery.isSuccess) {
    return null;
  }

  const parties = listPartiesQuery.data;
  const savedParty = parties.find((p) => p.id === partyId);
  const { title } = partyRoutes.editParty(partyId);

  // If the party was just deleted, this form may still render momentarily.
  // Ignore it.
  /* istanbul ignore next - @preserve */
  if (!savedParty) {
    return null;
  }

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs currentTitle={title} parentRoutes={[partyRoutes.root]} />
        <H1>{title}</H1>
      </Header>
      <MainContent>
        <PartyForm electionId={electionId} savedParty={savedParty} />
      </MainContent>
    </React.Fragment>
  );
}

interface PartyFormProps {
  electionId: ElectionId;
  savedParty?: Party;
}

function PartyForm(props: PartyFormProps): JSX.Element {
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

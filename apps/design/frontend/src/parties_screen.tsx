import React from 'react';
import {
  Button,
  Callout,
  Font,
  H1,
  Icons,
  LinkButton,
  P,
} from '@votingworks/ui';
import { Switch, Route, useParams, useHistory } from 'react-router-dom';
import { Party } from '@votingworks/types';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { Form, Row } from './layout';
import {
  createParty,
  deleteParty,
  getBallotsFinalizedAt,
  listParties,
  updateParty,
} from './api';
import { generateId } from './utils';
import { useTitle } from './hooks/use_title';
import { TooltipContainer, Tooltip } from './tooltip';
import { InputWithAudio } from './ballot_audio/input_with_audio';
import { cssStyledScrollbars } from './scrollbars';

const MainContent = styled.div`
  display: grid;
  grid-gap: 0;
  grid-template-rows: min-content 1fr;
  grid-template-areas:
    'actions actions'
    'parties detail';
  /* grid-template-columns: minmax(45rem, min(30%, 55ch)) 1fr; */
  grid-template-columns: max-content 1fr;
  grid-template-rows: min-content 1fr;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;

  .icon-button {
    padding: 0.6rem 0.75rem;
  }

  .input-row-button {
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
  }
`;

const ListActionsRow = styled(Row)`
  background: ${(p) => p.theme.colors.background};
  border-bottom: 1px solid #aaa;
  gap: 0.5rem;
  grid-area: actions;
  height: min-content;
  padding: 0.5rem 1rem;
  z-index: 1;
`;

const PartiesForm = styled(Form)`
  display: grid;
  grid-gap: 0;
  grid-area: parties;
  grid-template-rows: 1fr min-content;
  /* grid-template-columns: minmax(25ch, min(30%, 55ch)) 1fr; */
  height: 100%;
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;

  .icon-button {
    padding: 0.6rem 0.75rem;
  }

  .input-row-button {
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
  }

  input:disabled {
    cursor: not-allowed;
  }

  &[data-editing='false'] {
    input,
    .search-select > div {
      background-color: ${(p) => p.theme.colors.background};
      /* font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold}; */
      color: ${(p) => p.theme.colors.onBackground};
    }
  }
`;

const Body = styled.div`
  align-items: start;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  overflow-x: visible;
  overflow-y: auto;
  padding: 1rem;
  width: 100%;

  ${cssStyledScrollbars}
`;

const PartyList = styled.div`
  display: grid;
  grid-gap: 1rem;
  grid-template-columns: 15rem 10rem 6rem min-content;
  /* max-width: 25rem; */
  /* width: 100%; */
  width: 100%;

  > * {
    /* max-width: 20rem; */
    /* min-width: 100% !important; */
  }
  input {
    /* max-width: 20rem; */
    /* min-width: unset !important; */
  }
`;

const Footer = styled.div`
  border-top: 1px solid #aaa;
  display: flex;
  flex-wrap: wrap-reverse;
  gap: 0.5rem;
  margin: 0 1rem;
  padding: 1rem 0;
`;

function PartiesTab(props: { editing?: boolean }): JSX.Element | null {
  const { editing } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const [newParties, setNewParties] = React.useState<Party[]>([]);
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  const updatePartyMutation = updateParty.useMutation();
  const createPartyMutation = createParty.useMutation();
  const deletePartyMutation = deleteParty.useMutation();
  const history = useHistory();

  /* istanbul ignore next - @preserve */
  if (!(listPartiesQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)) {
    return null;
  }

  if (!editing && newParties.length > 0) setNewParties([]);

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const parties = listPartiesQuery.data;
  const partiesRoutes = routes.election(electionId).parties;

  function onSubmit() {
    // if (savedParty) {
    //   updatePartyMutation.mutate(
    //     { electionId, updatedParty: party },
    //     {
    //       onSuccess: (result) => {
    //         if (result.isOk()) {
    //           goBackToPartiesList();
    //         }
    //       },
    //     }
    //   );
    // } else {
    //   createPartyMutation.mutate(
    //     { electionId, newParty: party },
    //     {
    //       onSuccess: (result) => {
    //         if (result.isOk()) {
    //           goBackToPartiesList();
    //         }
    //       },
    //     }
    //   );
    // }
  }

  function onDelete() {
    // deletePartyMutation.mutate(
    //   { electionId, partyId: assertDefined(savedParty).id },
    //   { onSuccess: goBackToPartiesList }
    // );
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

  function setIsEditing(newState: boolean) {
    history.replace(
      newState ? partiesRoutes.edit.path : partiesRoutes.root.path
    );
  }

  const disabled = !editing || someMutationIsLoading;

  return (
    <React.Fragment>
      <ListActionsRow>
        {!ballotsFinalizedAt && (
          <Button
            variant="primary"
            icon="Add"
            disabled={someMutationIsLoading}
            onPress={() => {
              setNewParties([...newParties, createBlankParty()]);
              setIsEditing(true);
            }}
          >
            Add Party
          </Button>
        )}
      </ListActionsRow>
      {parties.length === 0 && newParties.length === 0 && (
        <P style={{ gridArea: 'parties', padding: '1rem' }}>
          <Icons.Info /> You haven&apos;t added any parties to this election
          yet.
        </P>
      )}
      <PartiesForm
        data-editing={editing ? 'true' : 'false'}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        onReset={(e) => {
          e.preventDefault();
          setNewParties([]);
          setIsEditing(!editing);
        }}
      >
        <Body>
          {errorMessage}
          {(parties.length > 0 || newParties.length > 0) && (
            <PartyList>
              <Font weight="bold">Full Name</Font>
              <Font weight="bold">Short Name</Font>
              <Font weight="bold">Abbreviation</Font>
              <div />
              {parties.map((party, i) => (
                <PartyRow
                  disabled={disabled}
                  editing={editing}
                  first={i === 0}
                  key={party.id}
                  party={party}
                />
              ))}
              {newParties.map((party, i) => (
                <PartyRow
                  disabled={disabled}
                  editing={editing}
                  first={parties.length + i === 0}
                  key={party.id}
                  party={party}
                />
              ))}
            </PartyList>
          )}
          {!ballotsFinalizedAt && editing && (
            <Button
              icon="Add"
              disabled={disabled}
              onPress={() => {
                setNewParties([...newParties, createBlankParty()]);
                setIsEditing(true);
              }}
            >
              Add Party
            </Button>
          )}
        </Body>
        {(parties.length > 0 || newParties.length > 0) && (
          <Footer>
            {editing ? (
              <React.Fragment>
                <Button type="reset">Cancel</Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon="Done"
                  disabled={someMutationIsLoading}
                >
                  Save
                </Button>
              </React.Fragment>
            ) : (
              <Button icon="Edit" type="reset" variant="primary">
                Edit Parties
              </Button>
            )}
          </Footer>
        )}
      </PartiesForm>
    </React.Fragment>
  );
}

function PartyRow(props: {
  disabled?: boolean;
  party: Party;
  editing?: boolean;
  first?: boolean;
}) {
  const { disabled, editing, first, party } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const partiesRoutes = routes.election(electionId).parties;

  return (
    <React.Fragment key={party.id}>
      <InputWithAudio
        autoComplete="off"
        autoFocus={party.fullName === ''}
        editing={editing}
        disabled={disabled}
        type="text"
        defaultValue={party.fullName}
        onBlur={(e) => {
          e.target.value = e.target.value.trim();
        }}
        required
        style={{ minWidth: '15rem' }}
        tooltipPlacement={first ? 'bottom' : 'top'}
      />
      <InputWithAudio
        autoComplete="off"
        disabled={disabled}
        type="text"
        defaultValue={party.name}
        editing={editing}
        onBlur={(e) => {
          e.target.value = e.target.value.trim();
        }}
        required
        style={{ minWidth: '8rem' }}
        tooltipPlacement={first ? 'bottom' : 'top'}
      />
      <input
        autoComplete="off"
        disabled={disabled}
        type="text"
        defaultValue={party.abbrev}
        onBlur={(e) => {
          e.target.value = e.target.value.trim();
        }}
        required
        style={{ minWidth: '6rem' }}
      />

      {editing ? (
        <TooltipContainer as="div" style={{ width: 'min-content' }}>
          <Button
            className="input-row-button icon-button"
            disabled={disabled}
            icon="Trash"
            variant="danger"
            fill="transparent"
            onPress={() => {}}
          />
          <Tooltip alignTo="right" bold>
            Delete Party
          </Tooltip>
        </TooltipContainer>
      ) : (
        <div />
      )}
    </React.Fragment>
  );
}

function createBlankParty(): Party {
  return {
    abbrev: '',
    fullName: '',
    id: generateId(),
    name: '',
  };
}

export function PartiesScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const partiesParamRoutes = electionParamRoutes.parties;
  const partiesRoutes = routes.election(electionId).parties;
  useTitle(routes.election(electionId).parties.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Parties</H1>
      </Header>
      <MainContent>
        <Switch>
          <Route path={partiesParamRoutes.edit.path}>
            <PartiesTab editing />
          </Route>
          <Route path={partiesParamRoutes.root.path}>
            <PartiesTab />
          </Route>
        </Switch>
      </MainContent>
    </ElectionNavScreen>
  );
}

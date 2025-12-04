import React from 'react';
import { Button, Callout, Font, H1 } from '@votingworks/ui';
import { Switch, Route, useParams, useHistory } from 'react-router-dom';
import { ElectionStringKey, Party } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { FixedViewport } from './layout';
import { getBallotsFinalizedAt, listParties } from './api';
import { generateId } from './utils';
import { useTitle } from './hooks/use_title';
import { TooltipContainer, Tooltip } from './tooltip';
import { InputWithAudio } from './ballot_audio/input_with_audio';
import {
  FormBody,
  FormErrorContainer,
  FormFixed,
  FormFooter,
} from './form_fixed';
import { PartyAudioPanel } from './party_audio_panel';
import * as api from './api';

export function PartiesScreen2(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const partiesParamRoutes = electionParamRoutes.parties2;
  const { title } = partiesParamRoutes.root;
  useTitle(title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      <Switch>
        <Route path={partiesParamRoutes.edit.path}>
          <Content editing />
        </Route>
        <Route path={partiesParamRoutes.root.path}>
          <Content editing={false} />
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}

const Viewport = styled(FixedViewport)`
  display: grid;
  grid-template-rows: min-content 1fr;

  .icon-button {
    background: ${(p) => p.theme.colors.background};
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    padding: 0.6rem 0.75rem;
  }
`;

const ListActionsRow = styled.div`
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
`;

const PartyList = styled.div`
  display: grid;
  grid-gap: 1rem;
  grid-template-columns: 3fr 2fr 1fr min-content;
  width: 100%;
  max-width: 40rem;
`;

const Body = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  width: 100%;

  /* Party List */
  > :first-child:not(:only-child) {
    min-width: 25rem;
    max-width: min(50%, 42rem);
    width: 100%;
  }

  /* Audio Panel */
  > :last-child:not(:only-child) {
    flex-grow: 1;
  }
`;

const NoPartiesCallout = styled(Callout)`
  max-width: 55ch;
  width: max-content;
`;

function Content(props: { editing: boolean }): JSX.Element | null {
  const { editing } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const [deletedPartyIds, setDeletedPartyIds] = React.useState(
    new Set<string>()
  );
  const [partyEdits, setPartyEdits] = React.useState<Party[]>([]);
  const [newParties, setNewParties] = React.useState<Party[]>([]);

  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  const updatePartiesMutation = api.updateParties.useMutation();

  React.useEffect(() => {
    if (!listPartiesQuery.data) return;
    setPartyEdits([...listPartiesQuery.data]);
  }, [listPartiesQuery.data]);

  const history = useHistory();
  const partiesRoutes = routes.election(electionId).parties2;
  const partyParamRoutes = routes.election(':electionId').parties2;

  /* istanbul ignore next - @preserve */
  if (!(listPartiesQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)) {
    return null;
  }

  if (!editing && newParties.length > 0) setNewParties([]);

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const parties = listPartiesQuery.data;

  function onSubmit() {
    if (
      partyEdits.length === 0 &&
      newParties.length === 0 &&
      deletedPartyIds.size === 0
    ) {
      reset();
      setIsEditing(false);
      return;
    }

    updatePartiesMutation.mutate(
      {
        electionId,
        deletedPartyIds: [...deletedPartyIds],
        newParties,
        updatedParties: partyEdits,
      },
      {
        onSuccess: (result) => {
          if (result.isErr()) return;

          reset();
          setIsEditing(false);
        },
      }
    );
  }

  function reset() {
    setNewParties([]);
    setPartyEdits([...parties]);
    setDeletedPartyIds(new Set());
  }

  const someMutationIsLoading = updatePartiesMutation.isLoading;

  const error = updatePartiesMutation.data?.err();
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

  const existingParties = partyEdits;

  return (
    <Viewport>
      {!ballotsFinalizedAt && (
        <ListActionsRow>
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
        </ListActionsRow>
      )}

      <Body>
        <FormFixed
          editing={editing}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          onReset={(e) => {
            e.preventDefault();
            reset();
            setIsEditing(!editing);
          }}
        >
          <FormBody>
            {existingParties.length === 0 && newParties.length === 0 && (
              <NoPartiesCallout color="neutral" icon="Info">
                You haven&apos;t added any parties to this election yet.
              </NoPartiesCallout>
            )}

            {(partyEdits.length > 0 || newParties.length > 0) && (
              <PartyList>
                <Font weight="bold">Full Name</Font>
                <Font weight="bold">Short Name</Font>
                <Font weight="bold">Abbreviation</Font>
                <div />

                {partyEdits.map((party, i) => (
                  <PartyRow
                    disabled={disabled}
                    editing={editing}
                    key={party.id}
                    onChange={(p) => {
                      const copy = [...partyEdits];
                      copy[i] = p;

                      setPartyEdits(copy);
                    }}
                    onDelete={() => {
                      const copy: Party[] = [];

                      for (const p of partyEdits) {
                        if (p.id === party.id) continue;
                        copy.push(p);
                      }

                      setPartyEdits(copy);
                      setDeletedPartyIds(
                        new Set([...deletedPartyIds, party.id])
                      );
                    }}
                    party={party}
                  />
                ))}

                {newParties.map((party, i) => (
                  <PartyRow
                    party={party}
                    disabled={disabled}
                    editing={editing}
                    key={party.id}
                    onChange={(p) => {
                      const copy = [...newParties];
                      copy[i] = p;
                      setNewParties(copy);
                    }}
                    onDelete={() => {
                      const copy: Party[] = [];

                      for (const p of newParties) {
                        if (p.id === party.id) continue;
                        copy.push(p);
                      }

                      setNewParties(copy);
                    }}
                  />
                ))}
              </PartyList>
            )}

            {editing && (
              <div>
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
              </div>
            )}
          </FormBody>

          <FormErrorContainer>{errorMessage}</FormErrorContainer>

          {!ballotsFinalizedAt && (
            <FormFooter>
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
            </FormFooter>
          )}
        </FormFixed>

        <Switch>
          <Route
            path={
              partyParamRoutes.audio({
                stringKey: ':stringKey',
                subkey: ':subkey',
              }).path
            }
            exact
            component={PartyAudioPanel}
          />
        </Switch>
      </Body>
    </Viewport>
  );
}

function PartyRow(props: {
  disabled?: boolean;
  editing: boolean;
  onChange: (party: Party) => void;
  onDelete: (partyId: string) => void;
  party: Party;
}) {
  const { disabled, editing, onChange, onDelete, party } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const partiesRoutes = routes.election(electionId).parties2;

  return (
    <React.Fragment key={party.id}>
      <InputWithAudio
        audioScreenUrl={
          partiesRoutes.audio({
            stringKey: ElectionStringKey.PARTY_FULL_NAME,
            subkey: party.id,
          }).path
        }
        autoComplete="off"
        autoFocus={party.fullName === ''}
        editing={editing}
        disabled={disabled}
        type="text"
        value={party.fullName}
        onBlur={(e) => onChange({ ...party, fullName: e.target.value.trim() })}
        onChange={(e) => onChange({ ...party, fullName: e.target.value })}
        required
        style={{ minWidth: '4rem' }}
      />
      <InputWithAudio
        audioScreenUrl={
          partiesRoutes.audio({
            stringKey: ElectionStringKey.PARTY_NAME,
            subkey: party.id,
          }).path
        }
        autoComplete="off"
        disabled={disabled}
        type="text"
        value={party.name}
        editing={editing}
        onBlur={(e) => onChange({ ...party, name: e.target.value.trim() })}
        onChange={(e) => onChange({ ...party, name: e.target.value })}
        required
        style={{ minWidth: '4rem' }}
      />
      <input
        autoComplete="off"
        disabled={disabled}
        type="text"
        value={party.abbrev}
        onBlur={(e) => onChange({ ...party, abbrev: e.target.value.trim() })}
        onChange={(e) => onChange({ ...party, abbrev: e.target.value })}
        required
        style={{ minWidth: '4rem' }}
      />

      {editing ? (
        <TooltipContainer as="div" style={{ width: 'min-content' }}>
          <Button
            className="icon-button"
            disabled={disabled}
            icon="Trash"
            variant="danger"
            fill="transparent"
            onPress={onDelete}
            value={party.id}
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

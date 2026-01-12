import React from 'react';
import {
  H1,
  Button,
  Callout,
  DesktopPalette,
  Font,
  useCurrentTheme,
} from '@votingworks/ui';
import { Route, Switch, useParams, useHistory } from 'react-router-dom';
import { ElectionStringKey, Party } from '@votingworks/types';
import { DuplicatePartyError } from '@votingworks/design-backend';
import styled from 'styled-components';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { getBallotsFinalizedAt, getElectionInfo, listParties } from './api';
import { useTitle } from './hooks/use_title';
import { generateId } from './utils';
import * as api from './api';
import { InputWithAudio } from './ballot_audio/input_with_audio';
import { FormFixed, FormBody, FormFooter } from './form_fixed';
import { FixedViewport, ListActionsRow } from './layout';
import { PartyAudioPanel } from './party_audio_panel';
import { TooltipContainer, Tooltip } from './tooltip';

export function PartiesScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const partiesParamRoutes = electionParamRoutes.parties;

  const { title } = partiesParamRoutes.root;
  useTitle(title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      <Switch>
        <Route path={partiesParamRoutes.edit.path}>
          <Contents editing />
        </Route>
        <Route path={partiesParamRoutes.root.path}>
          <Contents editing={false} />
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}

const Viewport = styled(FixedViewport)<{ hasActionsRow: boolean }>`
  display: grid;
  grid-template-rows: ${(p) => (p.hasActionsRow ? 'min-content 1fr' : '1fr')};
`;

const Body = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  width: 100%;

  /* Parties Form */
  > :first-child:not(:only-child) {
    border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
      ${DesktopPalette.Gray30};
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

const PartyList = styled.div`
  display: grid;
  grid-gap: 1rem;
  grid-template-columns: 3fr 2fr 1fr min-content;
  width: 100%;
  max-width: 40rem;

  .icon-button {
    background: ${(p) => p.theme.colors.background};
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    padding: 0.6rem 0.75rem;
  }
`;

function Contents(props: { editing: boolean }): React.ReactNode {
  const { editing } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const [deletedIds, setDeletedPartyIds] = React.useState(new Set<string>());
  const [newParties, setNewParties] = React.useState<Party[]>([]);
  const [updatedParties, setUpdatedParties] = React.useState<Party[]>([]);

  const history = useHistory();
  const partiesRoutes = routes.election(electionId).parties;
  const partyParamRoutes = routes.election(':electionId').parties;

  const savedPartiesQuery = listParties.useQuery(electionId);
  const ballotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);

  // Reset form on initial and post-save fetches:
  React.useEffect(() => {
    if (!savedPartiesQuery.data) return;

    setNewParties([]);
    setDeletedPartyIds(new Set());
    setUpdatedParties([...savedPartiesQuery.data]);
  }, [savedPartiesQuery.data]);

  const updatePartiesMutation = api.updateParties.useMutation();
  const error = updatePartiesMutation.data?.err();

  if (
    !(
      savedPartiesQuery.isSuccess &&
      ballotsFinalizedAtQuery.isSuccess &&
      getElectionInfoQuery.isSuccess
    )
  ) {
    return null;
  }

  function onSubmit() {
    updatePartiesMutation.mutate(
      {
        electionId,
        deletedPartyIds: [...deletedIds],
        newParties,
        updatedParties,
      },
      {
        onSuccess: (result) => {
          if (result.isOk()) setEditing(false);
        },
      }
    );
  }

  function setEditing(switchToEdit: boolean) {
    history.replace(
      switchToEdit ? partiesRoutes.edit.path : partiesRoutes.root.path
    );
  }

  function onListChange(
    list: Party[],
    updateList: (d: Party[]) => void,
    index: number,
    party: Party
  ) {
    if (error?.partyId === party.id && isChanged(list[index], party)) {
      updatePartiesMutation.reset();
    }

    const copy = [...list];
    copy[index] = party;
    updateList(copy);
  }

  const ballotsFinalized = !!ballotsFinalizedAtQuery.data;
  const hasExternalSource = Boolean(getElectionInfoQuery.data.externalSource);
  const savedParties = savedPartiesQuery.data;
  const updating = updatePartiesMutation.isLoading;
  const disabled = ballotsFinalized || !editing || updating;

  function reset() {
    setNewParties([]);
    setUpdatedParties([...savedParties]);
    setDeletedPartyIds(new Set());
    updatePartiesMutation.reset();
  }

  return (
    <Viewport hasActionsRow={!hasExternalSource}>
      {!hasExternalSource && (
        <ListActionsRow>
          <Button
            disabled={updating || ballotsFinalized}
            icon="Add"
            onPress={() => {
              setNewParties([...newParties, createBlankParty()]);
              setEditing(true);
            }}
            variant="primary"
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
            setEditing(!editing);
          }}
        >
          <FormBody>
            {savedParties.length + newParties.length === 0 && (
              <NoPartiesCallout color="neutral" icon="Info">
                You haven&apos;t added any parties to this election yet.
              </NoPartiesCallout>
            )}

            {updatedParties.length + newParties.length > 0 && (
              <PartyList>
                <Font weight="bold">Full Name</Font>
                <Font weight="bold">Short Name</Font>
                <Font weight="bold">Abbreviation</Font>
                <div /> {/* Delete/Audio button column */}
                {updatedParties.map((party, i) => (
                  <PartyRow
                    disabled={disabled}
                    editing={editing}
                    key={party.id}
                    onChange={(p) =>
                      onListChange(updatedParties, setUpdatedParties, i, p)
                    }
                    onDelete={() => {
                      setUpdatedParties(
                        updatedParties.filter((p) => p.id !== party.id)
                      );
                      setDeletedPartyIds(new Set([...deletedIds, party.id]));
                    }}
                    party={party}
                    updateError={error}
                  />
                ))}
                {newParties.map((party, i) => (
                  <PartyRow
                    disabled={disabled}
                    editing={editing}
                    key={party.id}
                    onChange={(p) =>
                      onListChange(newParties, setNewParties, i, p)
                    }
                    onDelete={() => {
                      setNewParties(
                        newParties.filter((p) => p.id !== party.id)
                      );
                    }}
                    party={party}
                    updateError={error}
                  />
                ))}
              </PartyList>
            )}
          </FormBody>

          {!ballotsFinalized && !hasExternalSource && (
            <FormFooter>
              {editing ? (
                <React.Fragment>
                  <Button disabled={updating} type="reset">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    icon="Done"
                    disabled={updating}
                  >
                    Save
                  </Button>
                </React.Fragment>
              ) : (
                <Button
                  disabled={savedParties.length === 0}
                  icon="Edit"
                  type="reset"
                  variant={savedParties.length === 0 ? 'neutral' : 'primary'}
                >
                  Edit Parties
                </Button>
              )}
            </FormFooter>
          )}
        </FormFixed>

        <Switch>
          <Route
            path={partyParamRoutes.audio({
              stringKey: ':stringKey',
              subkey: ':subkey',
            })}
            exact
            component={PartyAudioPanel}
          />
        </Switch>
      </Body>
    </Viewport>
  );
}

const ERROR_MESSAGE: Record<DuplicatePartyError['code'], string> = {
  'duplicate-abbrev': 'There is already a party with the same abbreviation.',
  'duplicate-full-name': 'There is already a party with the same full name.',
  'duplicate-name': 'There is already a party with the same short name.',
};

function PartyRow(props: {
  disabled?: boolean;
  editing: boolean;
  onChange: (party: Party) => void;
  onDelete: (partyId: string) => void;
  party: Party;
  // eslint-disable-next-line vx/gts-use-optionals -- require explicit prop
  updateError: DuplicatePartyError | undefined;
}) {
  const { disabled, editing, updateError, onChange, onDelete, party } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const partiesRoutes = routes.election(electionId).parties;

  const hasErr = updateError?.partyId === party.id;
  const hasAbbrevErr = hasErr && updateError.code === 'duplicate-abbrev';
  const hasFullNameErr = hasErr && updateError.code === 'duplicate-full-name';
  const hasNameErr = hasErr && updateError.code === 'duplicate-name';

  const errorRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    errorRef.current?.scrollIntoView({ block: 'end' });
  }, [updateError]);

  const theme = useCurrentTheme();

  return (
    <React.Fragment key={party.id}>
      <InputWithAudio
        audioScreenUrl={partiesRoutes.audio({
          stringKey: ElectionStringKey.PARTY_FULL_NAME,
          subkey: party.id,
        })}
        autoComplete="off"
        autoFocus={party.fullName === ''}
        editing={editing}
        disabled={disabled}
        type="text"
        value={party.fullName}
        onBlur={(e) => onChange({ ...party, fullName: e.target.value.trim() })}
        onChange={(e) => onChange({ ...party, fullName: e.target.value })}
        required
        style={{
          borderColor: hasFullNameErr ? theme.colors.dangerAccent : undefined,
          minWidth: '4rem',
        }}
      />

      <InputWithAudio
        audioScreenUrl={partiesRoutes.audio({
          stringKey: ElectionStringKey.PARTY_NAME,
          subkey: party.id,
        })}
        autoComplete="off"
        disabled={disabled}
        type="text"
        value={party.name}
        editing={editing}
        onBlur={(e) => onChange({ ...party, name: e.target.value.trim() })}
        onChange={(e) => onChange({ ...party, name: e.target.value })}
        required
        style={{
          borderColor: hasNameErr ? theme.colors.dangerAccent : undefined,
          minWidth: '4rem',
        }}
      />

      <input
        autoComplete="off"
        disabled={disabled}
        type="text"
        value={party.abbrev}
        onBlur={(e) => onChange({ ...party, abbrev: e.target.value.trim() })}
        onChange={(e) => onChange({ ...party, abbrev: e.target.value })}
        required
        style={{
          borderColor: hasAbbrevErr ? theme.colors.dangerAccent : undefined,
          minWidth: '4rem',
        }}
      />

      {editing ? (
        <TooltipContainer as="div" style={{ width: 'min-content' }}>
          <Button
            aria-label={`Delete Party ${party.fullName}`}
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

      {hasErr && (
        <div
          ref={errorRef}
          style={{ gridColumn: '1 / -1', scrollMargin: '1rem' }}
        >
          <Callout icon="Danger" color="danger">
            {ERROR_MESSAGE[updateError.code]}
          </Callout>
        </div>
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

function isChanged(original: Party, updated: Party) {
  return (
    original.fullName.trim() !== updated.fullName.trim() ||
    original.name.trim() !== updated.name.trim() ||
    original.abbrev.trim() !== updated.abbrev.trim()
  );
}

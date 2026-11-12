import React from 'react';
import { Route, useHistory } from 'react-router-dom';
import styled from 'styled-components';
import {
  type DuplicatePartyError,
  generateId,
} from '@votingworks/election-definition-backend';
import {
  type ElectionId,
  ElectionStringKey,
  type Party,
  type PartyId,
} from '@votingworks/types';
import {
  Button,
  Callout,
  DesktopPalette,
  Font,
  useCurrentTheme,
} from '@votingworks/ui';
import { useAudioPanelRoutes } from './audio_panel_routes.js';
import { useEditModeRoutes } from './edit_mode_routes.js';
import { InputWithAudio } from './ballot_audio/input_with_audio.js';
import { useElectionDefinitionApi } from './election_definition_context.js';
import { FormBody, FormFixed, FormFooter } from './form_fixed.js';
import { FixedViewport, ListActionsRow } from './layout.js';
import { Tooltip, TooltipContainer } from './tooltip.js';

export interface PartiesEditorProps {
  electionId: ElectionId;
  isLocked?: boolean;
  AudioPanel?: React.ComponentType;
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
  gap: 1rem;
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

export function PartiesEditor(props: PartiesEditorProps): JSX.Element | null {
  const { electionId, isLocked, AudioPanel } = props;
  const history = useHistory();
  const editModeRoutes = useEditModeRoutes();
  const audioRoutes = useAudioPanelRoutes(':stringKey/:subkey');
  const editing = editModeRoutes.isEditing;
  function audioScreenUrl(
    stringKey: ElectionStringKey,
    partyId: PartyId
  ): string | undefined {
    return AudioPanel
      ? audioRoutes.screenUrl({ stringKey, subkey: partyId })
      : undefined;
  }

  const [deletedIds, setDeletedPartyIds] = React.useState(new Set<PartyId>());
  const [newParties, setNewParties] = React.useState<Party[]>([]);
  const [updatedParties, setUpdatedParties] = React.useState<Party[]>([]);

  const api = useElectionDefinitionApi();

  const savedPartiesQuery = api.listParties.useQuery(electionId);
  const electionInfoQuery = api.getElectionInfo.useQuery(electionId);

  // Reset form on initial and post-save fetches:
  React.useEffect(() => {
    if (!savedPartiesQuery.data) return;

    setNewParties([]);
    setDeletedPartyIds(new Set());
    setUpdatedParties([...savedPartiesQuery.data]);
  }, [savedPartiesQuery.data]);

  const updatePartiesMutation = api.updateParties.useMutation();
  const error = updatePartiesMutation.data?.err();

  if (!savedPartiesQuery.isSuccess || !electionInfoQuery.isSuccess) {
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
      switchToEdit ? editModeRoutes.editUrl : editModeRoutes.viewUrl
    );
  }

  function onListChange(
    list: Party[],
    updateList: (d: Party[]) => void,
    index: number,
    party: Party
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (error?.partyId === party.id && isChanged(list[index]!, party)) {
      updatePartiesMutation.reset();
    }

    const copy = [...list];
    copy[index] = party;
    updateList(copy);
  }

  const hasExternalSource = Boolean(electionInfoQuery.data.externalSource);
  const savedParties = savedPartiesQuery.data;
  const updating = updatePartiesMutation.isLoading;
  const disabled = !!isLocked || !editing || updating;

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
            disabled={updating || isLocked}
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
                    audioScreenUrl={audioScreenUrl}
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
                    audioScreenUrl={audioScreenUrl}
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

          {!isLocked && !hasExternalSource && (
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

        {AudioPanel && (
          <Route path={audioRoutes.panelPath}>
            <AudioPanel />
          </Route>
        )}
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
  audioScreenUrl: (
    stringKey: ElectionStringKey,
    partyId: PartyId
  ) => string | undefined;
  disabled?: boolean;
  editing: boolean;
  onChange: (party: Party) => void;
  onDelete: (partyId: PartyId) => void;
  party: Party;
  // eslint-disable-next-line vx/gts-use-optionals -- require explicit prop
  updateError: DuplicatePartyError | undefined;
}) {
  const {
    audioScreenUrl,
    disabled,
    editing,
    updateError,
    onChange,
    onDelete,
    party,
  } = props;

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
        audioScreenUrl={audioScreenUrl(
          ElectionStringKey.PARTY_FULL_NAME,
          party.id
        )}
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
        audioScreenUrl={audioScreenUrl(ElectionStringKey.PARTY_NAME, party.id)}
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

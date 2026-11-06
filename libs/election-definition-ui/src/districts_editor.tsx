export interface DistrictsEditorProps {
  electionId: ElectionId;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  isLocked?: boolean;
  audioScreenUrl?: (districtId: DistrictId) => string;
  children?: React.ReactNode;
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

  /* Districts Form */
  > :first-child:not(:only-child) {
    border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
      ${DesktopPalette.Gray30};
    min-width: 15rem;
    max-width: min(30%, 28em);
    width: 100%;
  }

  /* Audio Panel */
  > :last-child:not(:only-child) {
    flex-grow: 1;
  }
`;

const NoDistrictsCallout = styled(Callout)`
  max-width: 55ch;
  width: max-content;
`;

const DistrictList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 25rem;
  width: 100%;

  :empty {
    display: none;
  }
`;

function createBlankDistrict(): District {
  return {
    id: generateId(),
    name: '',
  };
}

export function DistrictsEditor(props: DistrictsEditorProps): React.ReactNode {
  const {
    electionId,
    editing,
    onEditingChange,
    isLocked,
    audioScreenUrl,
    children,
  } = props;

  const [deletedIds, setDeletedDistrictIds] = React.useState(new Set<string>());
  const [newDistricts, setNewDistricts] = React.useState<District[]>([]);
  const [updatedDistricts, setUpdatedDistricts] = React.useState<District[]>(
    []
  );
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);

  const electionInfoQuery = getElectionInfo.useQuery(electionId);
  const savedDistrictsQuery = listDistricts.useQuery(electionId);

  // Reset form on initial and post-save fetches:
  React.useEffect(() => {
    if (!savedDistrictsQuery.data) return;

    setNewDistricts([]);
    setDeletedDistrictIds(new Set());
    setUpdatedDistricts([...savedDistrictsQuery.data]);
  }, [savedDistrictsQuery.data]);

  const updateDistrictsMutation = updateDistricts.useMutation();
  const error = updateDistrictsMutation.data?.err();

  if (!savedDistrictsQuery.isSuccess || !electionInfoQuery.isSuccess) {
    return null;
  }

  function onSubmit() {
    updateDistrictsMutation.mutate(
      {
        electionId,
        deletedDistrictIds: [...deletedIds],
        newDistricts,
        updatedDistricts,
      },
      {
        onSuccess: (result) => {
          if (result.isOk()) setEditing(false);
        },
      }
    );
  }

  function setEditing(switchToEdit: boolean) {
    onEditingChange(switchToEdit);
  }

  function onListChange(
    list: District[],
    updateList: (d: District[]) => void,
    index: number,
    district: District
  ) {
    if (
      error?.districtId === district.id &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      district.name.trim() !== list[index]!.name.trim()
    ) {
      updateDistrictsMutation.reset();
    }

    const copy = [...list];
    copy[index] = district;
    updateList(copy);
  }

  const savedDistricts = savedDistrictsQuery.data;
  const savedDistrictsById = savedDistricts.reduce<{
    [districtId: string]: District;
  }>(
    (districtsById, district) => ({
      ...districtsById,
      [district.id]: district,
    }),
    {}
  );
  const updating = updateDistrictsMutation.isLoading;
  const disabled = !!isLocked || !editing || updating;
  const hasExternalSource = Boolean(electionInfoQuery.data.externalSource);

  function reset() {
    setDeletedDistrictIds(new Set());
    setNewDistricts([]);
    setUpdatedDistricts([...savedDistricts]);
    updateDistrictsMutation.reset();
  }

  function cancelDelete() {
    setIsConfirmingDelete(false);
    reset();
    setEditing(false);
  }

  function confirmDelete() {
    setIsConfirmingDelete(false);
    onSubmit();
  }

  return (
    <Viewport hasActionsRow={!hasExternalSource}>
      {isConfirmingDelete &&
        // Saved district data can update before the deletedIds form state is cleared so make sure
        // that the two are in sync before proceeding to cross-reference the two
        [...deletedIds].every((id) => id in savedDistrictsById) && (
          <Modal
            title={
              deletedIds.size === 1 ? 'Delete District' : 'Delete Districts'
            }
            content={
              deletedIds.size === 1 ? (
                <P>
                  Are you sure you want to delete district{' '}
                  {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
                  {assertDefined(savedDistrictsById[[...deletedIds][0]!]).name}?{' '}
                  <strong>
                    This will delete all contests associated with the district.
                  </strong>
                </P>
              ) : (
                <P as="div">
                  Are you sure you want to delete the following districts?{' '}
                  <strong>
                    This will delete all contests associated with these
                    districts.
                  </strong>
                  <ul>
                    {[...deletedIds].map((id) => (
                      <li key={id}>
                        {assertDefined(savedDistrictsById[id]).name}
                      </li>
                    ))}
                  </ul>
                </P>
              )
            }
            actions={
              <React.Fragment>
                <Button variant="danger" onPress={confirmDelete} autoFocus>
                  {deletedIds.size === 1
                    ? 'Delete District'
                    : 'Delete Districts'}
                </Button>
                <Button onPress={cancelDelete}>Cancel</Button>
              </React.Fragment>
            }
            onOverlayClick={cancelDelete}
          />
        )}
      {!hasExternalSource && (
        <ListActionsRow>
          <Button
            disabled={updating || isLocked}
            icon="Add"
            onPress={() => {
              setNewDistricts([...newDistricts, createBlankDistrict()]);
              setEditing(true);
            }}
            variant="primary"
          >
            Add District
          </Button>
        </ListActionsRow>
      )}
      <Body>
        <FormFixed
          editing={editing}
          onSubmit={(e) => {
            e.preventDefault();
            if (deletedIds.size > 0) {
              setIsConfirmingDelete(true);
              return;
            }
            onSubmit();
          }}
          onReset={(e) => {
            e.preventDefault();
            reset();
            setEditing(!editing);
          }}
        >
          <FormBody>
            {savedDistricts.length + newDistricts.length === 0 && (
              <NoDistrictsCallout color="neutral" icon="Info">
                You haven&apos;t added any districts to this election yet.
              </NoDistrictsCallout>
            )}

            <DistrictList>
              {updatedDistricts.map((district, i) => (
                <DistrictRow
                  audioScreenUrl={audioScreenUrl?.(district.id)}
                  disabled={disabled}
                  district={district}
                  editing={editing}
                  error={error}
                  isFirst={i === 0}
                  canDelete={!hasExternalSource}
                  key={district.id}
                  onChange={(d) =>
                    onListChange(updatedDistricts, setUpdatedDistricts, i, d)
                  }
                  onDelete={() => {
                    setUpdatedDistricts(
                      updatedDistricts.filter((d) => d.id !== district.id)
                    );
                    setDeletedDistrictIds(
                      new Set([...deletedIds, district.id])
                    );
                  }}
                />
              ))}

              {newDistricts.map((district, i) => (
                <DistrictRow
                  audioScreenUrl={audioScreenUrl?.(district.id)}
                  disabled={disabled}
                  district={district}
                  editing={editing}
                  error={error}
                  isFirst={updatedDistricts.length + i === 0}
                  canDelete={!hasExternalSource}
                  key={district.id}
                  onChange={(d) =>
                    onListChange(newDistricts, setNewDistricts, i, d)
                  }
                  // @coverage-defer
                  onDelete={() => {
                    setNewDistricts(
                      newDistricts.filter((d) => d.id !== district.id)
                    );
                  }}
                />
              ))}
            </DistrictList>
          </FormBody>

          {!isLocked && (
            <FormFooter>
              {editing ? (
                <React.Fragment>
                  <Button type="reset">Cancel</Button>
                  <Button
                    type="submit"
                    variant="primary"
                    icon="Done"
                    disabled={disabled}
                  >
                    Save
                  </Button>
                </React.Fragment>
              ) : (
                <Button
                  disabled={savedDistricts.length === 0}
                  icon="Edit"
                  type="reset"
                  variant={savedDistricts.length > 0 ? 'primary' : 'neutral'}
                >
                  Edit Districts
                </Button>
              )}
            </FormFooter>
          )}
        </FormFixed>

        {children}
      </Body>
    </Viewport>
  );
}

const DistrictRowContainer = styled.div`
  display: flex;
  width: 100%;

  > :has(button):not(:first-child) {
    margin-left: 0.5rem;
  }

  .icon-button {
    background: ${(p) => p.theme.colors.background};
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    padding: 0.6rem 0.75rem;
  }
`;

function DistrictRow(props: {
  audioScreenUrl?: string;
  disabled?: boolean;
  district: District;
  editing: boolean;
  error?: DuplicateDistrictError;
  isFirst?: boolean;
  canDelete?: boolean;
  onChange: (district: District) => void;
  onDelete: (districtId: string) => void;
}) {
  const {
    audioScreenUrl,
    disabled,
    district,
    editing,
    error,
    isFirst,
    canDelete,
    onChange,
    onDelete,
  } = props;

  const theme = useCurrentTheme();

  const errorRef = React.useRef<HTMLDivElement>(null);
  const hasError = error?.districtId === district.id;

  React.useLayoutEffect(() => {
    errorRef.current?.scrollIntoView({ block: 'end' });
  }, [hasError]);

  return (
    <React.Fragment>
      <DistrictRowContainer key={district.id}>
        <InputWithAudio
          audioScreenUrl={audioScreenUrl}
          autoFocus={district.name === ''}
          disabled={disabled}
          editing={editing}
          type="text"
          value={district.name}
          onBlur={(e) => onChange({ ...district, name: e.target.value.trim() })}
          onChange={(e) => onChange({ ...district, name: e.target.value })}
          autoComplete="off"
          required
          style={{
            borderColor: hasError ? theme.colors.dangerAccent : undefined,
          }}
          tooltipPlacement={isFirst ? 'bottom' : 'top'}
        />

        {editing && canDelete && (
          <TooltipContainer as="div" style={{ width: 'min-content' }}>
            <Button
              aria-label={`Delete District ${district.name}`}
              className="icon-button"
              disabled={disabled}
              icon="Trash"
              variant="danger"
              fill="transparent"
              onPress={() => onDelete(district.id)}
            />
            <Tooltip alignTo="right" attachTo={isFirst ? 'bottom' : 'top'} bold>
              Delete District
            </Tooltip>
          </TooltipContainer>
        )}
      </DistrictRowContainer>

      {hasError && (
        <div ref={errorRef} style={{ scrollMargin: '1rem' }}>
          <Callout icon="Danger" color="danger">
            There is already a district with the same name.
          </Callout>
        </div>
      )}
    </React.Fragment>
  );
}

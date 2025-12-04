import React, { useState } from 'react';
import {
  Button,
  LinkButton,
  P,
  Modal,
  H1,
  Callout,
  Caption,
  Font,
  DesktopPalette,
  H2,
  Card,
  CheckboxGroup,
  Icons,
} from '@votingworks/ui';
import {
  Redirect,
  Route,
  Switch,
  useHistory,
  useParams,
} from 'react-router-dom';
import {
  PrecinctId,
  ElectionId,
  ElectionStringKey,
  hasSplits,
  PrecinctSplit,
  Precinct,
  District,
} from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import { Column, FieldName, FixedViewport, InputGroup, Row } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import {
  createPrecinct,
  deletePrecinct,
  getBallotsFinalizedAt,
  getElectionInfo,
  listPrecincts,
  listDistricts,
  listParties,
  updatePrecinct,
} from './api';
import { generateId, replaceAtIndex } from './utils';
import { useTitle } from './hooks/use_title';
import { InputWithAudio } from './ballot_audio/input_with_audio';
import * as api from './api';
import { cssThemedScrollbars } from './scrollbars';
import { SealImageInput } from './seal_image_input';
import { SignatureImageInput } from './signature_image_input';
import {
  FormBody,
  FormErrorContainer,
  FormFixed,
  FormFooter,
} from './form_fixed';
import { PrecinctAudioPanel } from './precinct_audio_panel';

export function PrecinctsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctParamRoutes = electionParamRoutes.precincts;
  useTitle(routes.election(electionId).precincts.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Precincts</H1>
      </Header>
      <Switch>
        <Route
          path={precinctParamRoutes.view(':precinctId').path}
          component={Content}
        />
        <Route path={precinctParamRoutes.root.path} component={Content} />
        <Redirect to={precinctParamRoutes.root.path} />
      </Switch>
    </ElectionNavScreen>
  );
}

const Viewport = styled(FixedViewport)`
  display: grid;
  grid-template-rows: min-content 1fr;
`;

const ListActionsRow = styled.div`
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
`;

const Body = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  width: 100%;

  /* Sidebar */
  > :first-child {
    min-width: min-content;
    max-width: min(25%, 25rem);
    width: 100%;
  }

  /* Content pane */
  > :last-child {
    flex-grow: 1;
  }
`;

const NoPrecincts = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
`;

const EditPanel = styled.div`
  height: 100%;
  overflow: hidden;
`;

const PrecinctListItem = styled.div`
  align-items: center;
  border: 0;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray10};
  border-radius: 0;
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  text-decoration: none;
  transition-duration: 100ms;
  transition-property: background, border, box-shadow, color;
  transition-timing-function: ease-out;
  position: relative;

  :focus,
  :hover {
    background: ${(p) => p.theme.colors.containerLow};
    box-shadow: inset 3px 0px 0 ${DesktopPalette.Purple50};
    color: inherit;
    outline: none;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple10};
    box-shadow: inset 0.35rem 0 0 ${DesktopPalette.Purple80};
  }
`;

const PrecinctListItems = styled.div`
  box-shadow: inset 0 0 0 ${DesktopPalette.Purple50};
  display: flex;
  flex-direction: column;
`;

const PrecinctsScrollContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  grid-area: precincts;
  height: 100%;
  overflow-y: auto;
  position: relative;
  padding-right: 0.125rem;

  ${cssThemedScrollbars}
`;

const PrecinctList = styled.div`
  border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid #aaa;
  position: relative;
  flex-grow: 1;
  padding-bottom: 1rem;
`;

export function Content(): JSX.Element | null {
  const { electionId, precinctId } = useParams<
    ElectionIdParams & { precinctId?: string }
  >();
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const history = useHistory();
  const selectedPrecinctRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (!selectedPrecinctRef.current) return;
    selectedPrecinctRef.current.scrollIntoView({ block: 'nearest' });
  }, [precinctId]);

  if (
    !(
      listPrecinctsQuery.isSuccess &&
      getElectionInfoQuery.isSuccess &&
      listDistrictsQuery.isSuccess &&
      listPartiesQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess
    )
  ) {
    return null;
  }

  const precincts = listPrecinctsQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const precinctRoutes = routes.election(electionId).precincts;

  function onPrecinctClick(e: React.MouseEvent) {
    const href = e.currentTarget.getAttribute('data-href');
    if (href) history.push(href);
  }

  const precinctParamRoutes = electionParamRoutes.precincts;

  /**
   * Used as a route redirect, to auto-select the first available contest for
   * convenience, when navigating to the root route:
   */
  const defaultPrecinctRoute =
    !precinctId && precincts.length > 0
      ? precinctRoutes.view(precincts[0].id).path
      : null;

  return (
    <Viewport>
      {!ballotsFinalizedAt && (
        <ListActionsRow>
          <LinkButton
            variant="primary"
            icon="Add"
            to={precinctRoutes.add.path}
            disabled={!!ballotsFinalizedAt}
          >
            Add Precinct
          </LinkButton>
        </ListActionsRow>
      )}

      <Body>
        {precincts.length === 0 ? (
          <NoPrecincts>
            <Callout color="neutral" icon="Info">
              You haven&apos;t added any precincts to this election yet.
            </Callout>
          </NoPrecincts>
        ) : (
          <PrecinctsScrollContainer>
            {precincts.length === 0 && (
              <P>You haven&apos;t added any precincts to this election yet.</P>
            )}
            {precincts.length > 0 && (
              <PrecinctList>
                <PrecinctListItems>
                  {precincts.map((precinct) => (
                    <PrecinctListItem
                      key={precinct.id}
                      ref={
                        precinctId === precinct.id
                          ? selectedPrecinctRef
                          : undefined
                      }
                      aria-selected={precinctId === precinct.id}
                      data-href={precinctRoutes.view(precinct.id).path}
                      onClick={onPrecinctClick}
                    >
                      <div style={{ flexGrow: 1 }}>
                        <div>
                          <Font
                            weight={
                              precinctId === precinct.id ? 'bold' : 'regular'
                            }
                          >
                            {precinct.name}
                          </Font>
                        </div>
                        {hasSplits(precinct) ? (
                          <div>
                            <Caption
                              style={{
                                color: '#333',
                                whiteSpace: 'nowrap',
                              }}
                              weight="regular"
                            >
                              <Icons.Split
                                style={{
                                  color:
                                    precinctId === precinct.id
                                      ? DesktopPalette.Purple80
                                      : DesktopPalette.Purple60,
                                  transform: 'rotate(-90deg) scale(1, -1)',
                                }}
                              />{' '}
                              {precinct.splits.length} Splits
                            </Caption>
                          </div>
                        ) : (
                          <div>
                            <Caption style={{ color: '#333' }} weight="regular">
                              {precinct.districtIds.length === 1
                                ? `${precinct.districtIds.length} District`
                                : `${precinct.districtIds.length} Districts`}
                            </Caption>
                          </div>
                        )}
                      </div>
                    </PrecinctListItem>
                  ))}
                </PrecinctListItems>
              </PrecinctList>
            )}
          </PrecinctsScrollContainer>
        )}

        <EditPanel>
          <Switch>
            <Route
              path={
                precinctParamRoutes.audio.manage(
                  ':precinctId',
                  ':ttsMode',
                  ':stringKey',
                  ':subkey'
                ).path
              }
              exact
              component={PrecinctAudioPanel}
            />

            <Route
              path={precinctParamRoutes.add.path}
              component={AddPrecinctForm}
            />

            <Route
              path={precinctParamRoutes.view(':precinctId').path}
              component={EditPrecinctForm}
            />

            {defaultPrecinctRoute && <Redirect to={defaultPrecinctRoute} />}
          </Switch>
        </EditPanel>
      </Body>
    </Viewport>
  );
}

const PrecinctFormHeader = styled(H2)`
  /*
   * Offset the vertical flex gap a bit to keep this visually attached to the
   * rest of the form body.
   */
  margin-bottom: -0.25rem;
  padding: 0;
`;

interface PrecinctFormProps {
  editing: boolean;
  electionId: ElectionId;
  savedPrecinct?: Precinct;
  title: React.ReactNode;
}

function PrecinctForm(props: PrecinctFormProps): React.ReactNode {
  const { editing, electionId, savedPrecinct, title } = props;
  const [precinct, setPrecinct] = useState<Precinct>(
    savedPrecinct ??
      // To make mocked IDs predictable in tests, we pass a function here
      // so it will only be called on initial render.
      createBlankPrecinct
  );
  const getElectionFeaturesQuery = api.getElectionFeatures.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const listPartiesQuery = listParties.useQuery(electionId);
  const createPrecinctMutation = createPrecinct.useMutation();
  const updatePrecinctMutation = updatePrecinct.useMutation();
  const deletePrecinctMutation = deletePrecinct.useMutation();
  const history = useHistory();
  const precinctRoutes = routes.election(electionId).precincts;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [validationErrorMessage, setValidationErrorMessage] = useState<
    string | null
  >(null);

  /* istanbul ignore next - @preserve */
  if (
    !getElectionInfoQuery.isSuccess ||
    !getElectionFeaturesQuery.isSuccess ||
    !listDistrictsQuery.isSuccess ||
    !getBallotsFinalizedAtQuery.isSuccess ||
    !listPartiesQuery.isSuccess
  ) {
    return null;
  }
  const districts = listDistrictsQuery.data;
  const isFinalized = !!getBallotsFinalizedAtQuery.data;
  const electionFeatures = getElectionFeaturesQuery.data;

  function goBackToPrecinctsList() {
    history.push(precinctRoutes.root.path);
  }

  function setIsEditing(switchToEdit: boolean) {
    if (!savedPrecinct) return history.replace(precinctRoutes.root.path);

    history.replace(
      switchToEdit
        ? precinctRoutes.edit(savedPrecinct.id).path
        : precinctRoutes.view(savedPrecinct.id).path
    );
  }

  function onSubmit() {
    if (savedPrecinct) {
      updatePrecinctMutation.mutate(
        { electionId, updatedPrecinct: precinct },
        {
          onSuccess: (result) => setIsEditing(!result.isOk()),
        }
      );
    } else {
      createPrecinctMutation.mutate(
        { electionId, newPrecinct: precinct },
        {
          onSuccess: (result) => {
            if (result.isErr()) return;
            history.replace(precinctRoutes.view(precinct.id).path);
          },
        }
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

    if (savedPrecinct) setIsEditing(true);
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
    setIsEditing(true);
  }

  function onDelete() {
    deletePrecinctMutation.mutate(
      { electionId, precinctId: precinct.id },
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

  const error =
    createPrecinctMutation.data?.err() || updatePrecinctMutation.data?.err();
  const errorMessage = validationErrorMessage ? (
    <Callout icon="Danger" color="danger">
      {validationErrorMessage}
    </Callout>
  ) : error ? (
    (() => {
      switch (error) {
        case 'duplicate-precinct-name':
          return (
            <Callout icon="Danger" color="danger">
              There is already a precinct with the same name
            </Callout>
          );
        case 'duplicate-split-name':
          return (
            <Callout icon="Danger" color="danger">
              Precinct splits must have different names.
            </Callout>
          );
        case 'duplicate-split-districts':
          return (
            <Callout icon="Danger" color="danger">
              Precinct splits must have different districts.
            </Callout>
          );
        default: {
          /* istanbul ignore next - @preserve */
          throwIllegalValue(error);
        }
      }
    })()
  ) : null;

  const disabled = !editing || someMutationIsLoading;

  return (
    <FormFixed
      editing={editing}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        setPrecinct(savedPrecinct || createBlankPrecinct);
        setIsEditing(!editing);
      }}
    >
      <FormBody>
        <PrecinctFormHeader>{title}</PrecinctFormHeader>
        <InputGroup label="Name">
          <InputWithAudio
            audioScreenUrl={
              precinctRoutes.audio.manage(
                precinct.id,
                'text',
                ElectionStringKey.PRECINCT_NAME,
                precinct.id
              ).path
            }
            autoComplete="off"
            autoFocus={!precinct.name}
            disabled={disabled}
            editing={editing}
            onBlur={(e) =>
              setPrecinct({ ...precinct, name: e.target.value.trim() })
            }
            onChange={(e) => setPrecinct({ ...precinct, name: e.target.value })}
            required
            style={{ maxWidth: '20rem' }}
            type="text"
            value={precinct.name}
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
                        <InputWithAudio
                          audioScreenUrl={
                            precinctRoutes.audio.manage(
                              precinct.id,
                              'text',
                              ElectionStringKey.PRECINCT_SPLIT_NAME,
                              split.id
                            ).path
                          }
                          autoFocus={!split.name}
                          disabled={disabled}
                          editing={editing}
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
                          required
                        />
                      </InputGroup>
                      <DistrictList
                        disabled={disabled}
                        districts={districts}
                        editing={editing}
                        noDistrictsCallout={noDistrictsCallout}
                        onChange={(districtIds) =>
                          setSplit(index, {
                            ...split,
                            districtIds,
                          })
                        }
                        value={[...split.districtIds]}
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

                      {electionFeatures.PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE && (
                        <div>
                          <FieldName>Signature Image</FieldName>
                          <SignatureImageInput
                            value={split.clerkSignatureImage}
                            onChange={(value) =>
                              setSplit(index, {
                                ...split,
                                clerkSignatureImage: value,
                              })
                            }
                          />
                        </div>
                      )}

                      {electionFeatures.PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE && (
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
                      {editing && (
                        <Button
                          style={{ marginTop: 'auto' }}
                          onPress={onRemoveSplitPress}
                          value={index}
                        >
                          Remove Split
                        </Button>
                      )}
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
                  <DistrictList
                    disabled={disabled}
                    districts={districts}
                    editing={editing}
                    noDistrictsCallout={noDistrictsCallout}
                    onChange={(districtIds) =>
                      setPrecinct({
                        ...precinct,
                        districtIds,
                      })
                    }
                    value={[...precinct.districtIds]}
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
      </FormBody>

      <FormErrorContainer>{errorMessage}</FormErrorContainer>

      {!isFinalized && (
        <FormFooter>
          <PrimaryFormActions disabled={disabled} editing={editing} />

          <div style={{ flexGrow: 1 }} />

          {savedPrecinct && (
            <Button
              variant="danger"
              fill="outlined"
              icon="Delete"
              onPress={setIsConfirmingDelete}
              disabled={someMutationIsLoading}
              // eslint-disable-next-line react/jsx-boolean-value
              value={true}
            >
              Delete Precinct
            </Button>
          )}
        </FormFooter>
      )}

      {savedPrecinct && isConfirmingDelete && (
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
                onPress={onDelete}
                variant="danger"
                autoFocus
                disabled={someMutationIsLoading}
              >
                Delete Precinct
              </Button>
              <Button
                disabled={someMutationIsLoading}
                onPress={setIsConfirmingDelete}
                value={false}
              >
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
    </FormFixed>
  );
}

function DistrictList(props: {
  disabled?: boolean;
  districts: readonly District[];
  editing?: boolean;
  noDistrictsCallout?: React.ReactNode;
  onChange: (districtIds: string[]) => void;
  value: string[];
}) {
  const { disabled, districts, editing, noDistrictsCallout, onChange, value } =
    props;

  const filteredDistricts = editing
    ? districts
    : districts.filter((d) => value.includes(d.id));

  return (
    <CheckboxGroup
      disabled={disabled}
      label="Districts"
      hideLabel
      noOptionsMessage={noDistrictsCallout}
      options={filteredDistricts.map((district) => ({
        value: district.id,
        label: district.name,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

function createBlankPrecinct(): Precinct {
  return {
    name: '',
    id: generateId(),
    districtIds: [],
  };
}

function PrimaryFormActions(props: { disabled?: boolean; editing?: boolean }) {
  const { disabled, editing } = props;

  if (!editing) {
    return (
      <Button icon="Edit" type="reset" variant="primary">
        Edit
      </Button>
    );
  }

  return (
    <React.Fragment>
      <Button disabled={disabled} type="reset">
        Cancel
      </Button>
      <Button type="submit" variant="primary" icon="Done" disabled={disabled}>
        Save
      </Button>
    </React.Fragment>
  );
}

function AddPrecinctForm() {
  const { electionId } = useParams<ElectionIdParams>();

  return <PrecinctForm electionId={electionId} editing title="Add Precinct" />;
}

function EditPrecinctForm(): JSX.Element | null {
  const { electionId, precinctId } = useParams<
    ElectionIdParams & { precinctId: PrecinctId }
  >();
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const precinctParamRoutes = electionParamRoutes.precincts;

  /* istanbul ignore next - @preserve */
  if (!listPrecinctsQuery.isSuccess) {
    return null;
  }

  const precincts = listPrecinctsQuery.data;
  const savedPrecinct = precincts.find((c) => c.id === precinctId);

  // If the precinct was just deleted, this form may still render momentarily.
  // Ignore it.
  /* istanbul ignore next - @preserve */
  if (!savedPrecinct) return null;

  // return (
  //   <PrecinctForm
  //     electionId={electionId}
  //     key={precinctId}
  //     savedPrecinct={savedPrecinct}
  //   />
  // );

  return (
    <Switch>
      <Route path={precinctParamRoutes.edit(':precinctId').path} exact>
        <PrecinctForm
          electionId={electionId}
          key={precinctId}
          editing
          savedPrecinct={savedPrecinct}
          title="Edit Precinct"
        />
      </Route>
      <Route path={precinctParamRoutes.view(':precinctId').path} exact>
        <PrecinctForm
          electionId={electionId}
          editing={false}
          key={precinctId}
          savedPrecinct={savedPrecinct}
          title="Precinct Info"
        />
      </Route>
    </Switch>
  );
}

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
import styled, { css } from 'styled-components';
import { TtsStringDefault } from '@votingworks/design-backend';
import {
  Column,
  FieldName,
  Form,
  FormActionsRow,
  InputGroup,
  Row,
} from './layout';
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
import { BallotAudioPathParams } from './ballot_audio/routes';
import * as api from './api';
import { StringInfo } from './ballot_audio/string_info';
import { StringPanel } from './ballot_audio/elements';
import { EditPanel as AudioEditPanel } from './ballot_audio/edit_panel';
import { cssStyledScrollbars } from './scrollbars';
import { FixedViewport } from './edit_screen_elements';
import { SealImageInput } from './seal_image_input';
import { SignatureImageInput } from './signature_image_input';

export function PrecinctsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctParamRoutes = electionParamRoutes.precincts;
  useTitle(routes.election(electionId).precincts.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Precincts</H1>
      </Header>
      <FixedViewport>
        <Switch>
          <Route
            path={precinctParamRoutes.view(':precinctId').path}
            component={PrecinctsTab2}
          />
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
            component={PrecinctsTab2}
          />
          <Route
            path={precinctParamRoutes.root.path}
            component={PrecinctsTab2}
          />
          <Redirect to={precinctParamRoutes.root.path} />
        </Switch>
      </FixedViewport>
    </ElectionNavScreen>
  );
}

const PrecinctListItem = styled.div`
  align-items: center;
  border: 0;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem dashed #aaa;
  border-radius: 0;
  /* color: unset; */
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

const ListActionsRow = styled(Row)`
  background: ${(p) => p.theme.colors.background};
  /* box-shadow: 0 0.1rem 0.2rem 0.05rem rgba(0, 0, 0, 25%); */
  border-bottom: 1px solid #aaa;
  gap: 0.5rem;
  grid-area: actions;
  height: min-content;
  padding: 0.5rem 1rem;
  z-index: 1;
`;

const cssTabPanelExpanded = css`
  grid-template-areas:
    'actions actions'
    'precincts editor';

  /*
   * Last tuned for a candidate precinct to make good use of a viewport size of
   * ~1920px.
  */
  grid-template-columns: minmax(10rem, min(20%, 18rem)) 1fr;
  grid-template-rows: min-content 1fr;
`;

const TabPanel = styled.section`
  display: grid;
  padding: 0;
  grid-gap: 0;
  grid-template-rows: min-content auto;
  grid-template-areas:
    'actions'
    'precincts';
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;

  ${cssTabPanelExpanded}

  .icon-button {
    background: ${(p) => p.theme.colors.background};
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    padding: 0.6rem 0.75rem;
  }
`;

const PrecinctsScrollContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  grid-area: precincts;
  height: 100%;
  overflow-y: auto;
  position: relative;
  /* padding: 1rem 0.125rem 1rem 1rem; */
  padding-right: 0.125rem;

  ${cssStyledScrollbars}
`;

const PrecinctList = styled.div`
  /* border-bottom: ${(p) =>
    p.theme.sizes.bordersRem.hairline}rem solid #aaa; */
  border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid #aaa;
  /* border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid #aaa;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem; */
  /* border-bottom-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem; */
  position: relative;
  /* overflow: hidden; */
  flex-grow: 1;
  padding-bottom: 1rem;

  h2 {
    background-color: ${(p) => p.theme.colors.containerLow};
    border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid #aaa;
    border-top-left-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
    border-top-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
    margin: 0;
    padding: 0.75rem 1rem;
    margin-top: 0;
    /* position: sticky; */
    font-weight: 600;
    top: 0;
  }
`;

const EditPanel = styled.div`
  grid-area: editor;
  height: 100%;
  /* max-width: 60rem; */
  overflow: hidden;

  /* > * {
    max-width: 60rem;
  } */
`;

export function PrecinctsTab2(): JSX.Element | null {
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

  React.useEffect(() => {
    if (precinctId || !listPrecinctsQuery.isSuccess) return;

    const precincts = listPrecinctsQuery.data;
    const precinctRoutes = routes.election(electionId).precincts;

    history.replace(precinctRoutes.view(precincts[0].id).path);
  }, [precinctId, electionId, history, listPrecinctsQuery]);

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

  return (
    <TabPanel>
      <ListActionsRow>
        {!ballotsFinalizedAt && (
          <LinkButton
            variant="primary"
            icon="Add"
            to={precinctRoutes.add.path}
            disabled={!!ballotsFinalizedAt}
          >
            Add Precinct
          </LinkButton>
        )}
      </ListActionsRow>
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
                    precinctId === precinct.id ? selectedPrecinctRef : undefined
                  }
                  aria-selected={precinctId === precinct.id}
                  data-href={precinctRoutes.view(precinct.id).path}
                  onClick={onPrecinctClick}
                >
                  <div style={{ flexGrow: 1 }}>
                    <div>
                      <Font
                        weight={precinctId === precinct.id ? 'bold' : 'regular'}
                      >
                        {precinct.name}
                      </Font>
                    </div>
                    {hasSplits(precinct) ? (
                      <div>
                        <Caption
                          style={{
                            color: '#333',
                            // whiteSpace: 'nowrap',
                            // textOverflow: 'ellipsis',
                          }}
                          weight="regular"
                        >
                          {precinct.splits.length} Splits
                          {/* {precinct.splits.length} Splits,{' '}
                          {precinct.splits.reduce(
                            (total, split) =>
                              (total += split.districtIds.length),
                            0
                          )}{' '}
                          Districts */}
                        </Caption>
                      </div>
                    ) : (
                      <div>
                        <Caption
                          style={{
                            color: '#333',
                            // whiteSpace: 'nowrap',
                            // textOverflow: 'ellipsis',
                          }}
                          weight="regular"
                        >
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
            component={AudioPanel}
          />
          <Route
            path={precinctParamRoutes.view(':precinctId').path}
            component={EditPrecinctForm}
          />
        </Switch>
      </EditPanel>
    </TabPanel>
  );
}

const AudioPanelContainer = styled.div`
  height: 100%;
  padding: 1rem;
  position: relative;
  overflow-y: auto;

  ${cssStyledScrollbars}
`;

const AudioPanelHeader = styled.div`
  background: ${(p) => p.theme.colors.background};
  display: flex;
  height: min-content;
  margin-bottom: 0.3rem;

  button {
    font-size: 0.8rem;
    gap: 0.25rem;
    padding: 0;

    &:active,
    &:focus,
    &:hover {
      background: none !important;
    }
  }
`;

function AudioPanel(): React.ReactNode {
  const { precinctId, electionId, stringKey, subkey } = useParams<
    BallotAudioPathParams & { precinctId: string }
  >();
  const precinctRoutes = routes.election(electionId).precincts;

  const stringDefaults = api.ttsStringDefaults.useQuery(electionId).data;
  const currentString = React.useMemo(() => {
    if (!stringKey || !stringDefaults) return undefined;

    for (const appString of stringDefaults) {
      if (appString.key !== stringKey || appString.subkey !== subkey) continue;

      return appString;
    }
  }, [stringDefaults, stringKey, subkey]);

  if (!stringDefaults || !currentString) return null;

  return (
    <AudioPanelContainer>
      <AudioPanelHeader>
        <LinkButton
          icon="Previous"
          fill="transparent"
          variant="primary"
          to={precinctRoutes.view(precinctId).path}
        >
          Precinct Info
        </LinkButton>
      </AudioPanelHeader>
      <H2 style={{ margin: '0 0 0.5rem' }}>Precinct Audio</H2>
      <StringPanel>
        <StringInfo
          mini
          stringKey={currentString.key}
          subkey={currentString.subkey}
          text={currentString.text}
        />
        <AudioEditPanel
          key={joinStringKey(currentString)}
          str={currentString}
        />
      </StringPanel>
    </AudioPanelContainer>
  );
}

function joinStringKey(info: TtsStringDefault) {
  if (!info.subkey) return info.key;

  return `${info.key}.${info.subkey}`;
}

const PrecinctFormEl = styled(Form)`
  gap: 0;
  max-height: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;

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

const PrecinctFormHeader = styled(H2)`
  /*
   * Offset the vertical flex gap a bit to keep this visually attached to the
   * rest of the form body.
   */
  margin-bottom: -0.5rem;
  padding: 0;
`;

const PrecinctFormBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
  overflow: auto;
  padding: 1rem 0.75rem 1rem 0.875rem;
  margin-right: 0.25rem;

  ${cssStyledScrollbars}

  > * {
    /* max-width: 75ch; */
  }

  /* ${FieldName} {
    margin-bottom: 0.25rem;
  } */
`;

const PrecinctFormFooter = styled.div`
  /* box-shadow: 0 -0.75rem 0.5rem ${(p) => p.theme.colors.background}; */
  bottom: 0;
  border-top: 1px dashed #aaa;
  border-top: 1px solid #aaa;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: space-between;
  /* max-width: 72rem; */
  margin: 0 1rem 0 0.875rem;
  padding: 1rem 0;
  position: sticky;
`;

function PrecinctForm({
  editing,
  electionId,
  savedPrecinct,
}: {
  editing?: boolean;
  electionId: ElectionId;
  savedPrecinct?: Precinct;
}): React.ReactNode {
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

  function setIsEditing(newState: boolean) {
    if (!savedPrecinct) return history.replace(precinctRoutes.root.path);

    if (newState) {
      history.replace(precinctRoutes.edit(savedPrecinct.id).path);
    } else {
      history.replace(precinctRoutes.view(savedPrecinct.id).path);
    }
  }

  function onSubmit() {
    if (savedPrecinct) {
      updatePrecinctMutation.mutate(
        { electionId, updatedPrecinct: precinct },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToPrecinctsList();
            }
          },
        }
      );
    } else {
      createPrecinctMutation.mutate(
        { electionId, newPrecinct: precinct },
        {
          onSuccess: (result) => {
            if (result.isOk()) {
              goBackToPrecinctsList();
            }
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
    setIsEditing(true);
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
    <PrecinctFormEl
      data-editing={editing ? 'true' : 'false'}
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
      <PrecinctFormBody>
        <PrecinctFormHeader>Precinct Info</PrecinctFormHeader>
        <InputGroup label="Name">
          <InputWithAudio
            editing={editing}
            disabled={disabled}
            href={
              precinctRoutes.audio.manage(
                precinct.id,
                'text',
                ElectionStringKey.PRECINCT_NAME,
                precinct.id
              ).path
            }
            tooltipPlacement="bottom"
            type="text"
            value={precinct.name}
            onChange={(e) => setPrecinct({ ...precinct, name: e.target.value })}
            onBlur={(e) =>
              setPrecinct({ ...precinct, name: e.target.value.trim() })
            }
            autoComplete="off"
            required
            style={{ maxWidth: '20rem' }}
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
      </PrecinctFormBody>

      {!isFinalized && (
        <PrecinctFormFooter>
          {errorMessage}
          <PrimaryFormActions disabled={disabled} editing={editing} />
          {savedPrecinct && (
            <FormActionsRow>
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
            </FormActionsRow>
          )}
        </PrecinctFormFooter>
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
    </PrecinctFormEl>
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
      <FormActionsRow>
        <Button icon="Edit" type="reset" variant="primary">
          Edit
        </Button>
      </FormActionsRow>
    );
  }

  return (
    <FormActionsRow>
      <Button disabled={disabled} type="reset">
        Cancel
      </Button>
      <Button type="submit" variant="primary" icon="Done" disabled={disabled}>
        Save
      </Button>
    </FormActionsRow>
  );
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
        />
      </Route>
      <Route path={precinctParamRoutes.view(':precinctId').path} exact>
        <PrecinctForm
          electionId={electionId}
          key={precinctId}
          savedPrecinct={savedPrecinct}
        />
      </Route>
    </Switch>
  );
}

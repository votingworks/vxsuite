import React from 'react';
import { Button, Callout, H1 } from '@votingworks/ui';
import { Switch, Route, useParams, useHistory } from 'react-router-dom';
import { District, ElectionStringKey } from '@votingworks/types';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { FixedViewport } from './layout';
import { getBallotsFinalizedAt, listDistricts, updateDistricts } from './api';
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
import { DistrictAudioPanel } from './district_audio_panel';

export function DistrictsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const districtsParamRoutes = electionParamRoutes.districts;
  const { title } = districtsParamRoutes.root;

  useTitle(title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      <Switch>
        <Route path={districtsParamRoutes.edit.path}>
          <Content editing />
        </Route>
        <Route path={districtsParamRoutes.root.path}>
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

const DistrictRowContainer = styled.div`
  display: flex;
  width: 100%;

  > :has(button):not(:first-child) {
    margin-left: 0.5rem;
  }
`;

const Body = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  width: 100%;

  /* District List */
  > :first-child:not(:only-child) {
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

function Content(props: { editing: boolean }): JSX.Element | null {
  const { editing } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const [updatedDistricts, setUpdatedDistricts] = React.useState<District[]>(
    []
  );
  const [newDistricts, setNewDistricts] = React.useState<District[]>([]);
  const [deletedDistrictIds, setDeletedDistrictIds] = React.useState(
    new Set<string>()
  );
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  const updateDistrictsMutation = updateDistricts.useMutation();

  const history = useHistory();
  const districtsRoutes = routes.election(electionId).districts;
  const districtsParamRoutes = electionParamRoutes.districts;

  React.useEffect(() => {
    if (!listDistrictsQuery.data) return;
    setUpdatedDistricts([...listDistrictsQuery.data]);
  }, [listDistrictsQuery.data]);

  /* istanbul ignore next - @preserve */
  if (!(listDistrictsQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)) {
    return null;
  }

  if (!editing && newDistricts.length > 0) setNewDistricts([]);

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const districts = listDistrictsQuery.data;

  function onSubmit() {
    if (
      updatedDistricts.length === 0 &&
      newDistricts.length === 0 &&
      deletedDistrictIds.size === 0
    ) {
      reset();
      setIsEditing(false);
      return;
    }

    updateDistrictsMutation.mutate(
      {
        electionId,
        deletedDistrictIds: [...deletedDistrictIds],
        newDistricts,
        updatedDistricts,
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
    setNewDistricts([]);
    setUpdatedDistricts([...districts]);
    setDeletedDistrictIds(new Set());
  }

  const someMutationIsLoading = updateDistrictsMutation.isLoading;

  const errorMessage = (() => {
    if (updateDistrictsMutation.data?.isErr()) {
      const error = assertDefined(updateDistrictsMutation.data?.err());
      /* istanbul ignore next - @preserve */
      if (error !== 'duplicate-name') throwIllegalValue(error);
      return (
        <Callout icon="Danger" color="danger">
          There is already a district with the same name.
        </Callout>
      );
    }
  })();

  function setIsEditing(newState: boolean) {
    history.replace(
      newState ? districtsRoutes.edit.path : districtsRoutes.root.path
    );
  }

  const disabled = !editing || someMutationIsLoading;

  return (
    <Viewport>
      {!ballotsFinalizedAt && (
        <ListActionsRow>
          <Button
            variant="primary"
            icon="Add"
            disabled={someMutationIsLoading}
            onPress={() => {
              setNewDistricts([...newDistricts, createBlankDistrict()]);
              setIsEditing(true);
            }}
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
            onSubmit();
          }}
          onReset={(e) => {
            e.preventDefault();
            reset();
            setIsEditing(!editing);
          }}
        >
          <FormBody>
            {updatedDistricts.length === 0 && newDistricts.length === 0 && (
              <NoDistrictsCallout color="neutral" icon="Info">
                You haven&apos;t added any districts to this election yet.
              </NoDistrictsCallout>
            )}

            <DistrictList>
              {updatedDistricts.map((district, i) => (
                <DistrictRow
                  disabled={disabled}
                  district={district}
                  editing={editing}
                  first={i === 0}
                  key={district.id}
                  onChange={(p) => {
                    const copy = [...updatedDistricts];
                    copy[i] = p;

                    setUpdatedDistricts(copy);
                  }}
                  onDelete={() => {
                    const copy: District[] = [];

                    for (const p of updatedDistricts) {
                      if (p.id === district.id) continue;
                      copy.push(p);
                    }

                    setUpdatedDistricts(copy);
                    setDeletedDistrictIds(
                      new Set([...deletedDistrictIds, district.id])
                    );
                  }}
                />
              ))}

              {newDistricts.map((district, i) => (
                <DistrictRow
                  disabled={disabled}
                  district={district}
                  editing={editing}
                  first={updatedDistricts.length + i === 0}
                  key={district.id}
                  onChange={(p) => {
                    const copy = [...newDistricts];
                    copy[i] = p;
                    setNewDistricts(copy);
                  }}
                  onDelete={() => {
                    const copy: District[] = [];

                    for (const p of newDistricts) {
                      if (p.id === district.id) continue;
                      copy.push(p);
                    }

                    setNewDistricts(copy);
                  }}
                />
              ))}
            </DistrictList>

            {editing && (
              <div>
                <Button
                  icon="Add"
                  disabled={disabled}
                  onPress={() => {
                    setNewDistricts([...newDistricts, createBlankDistrict()]);
                    setIsEditing(true);
                  }}
                >
                  Add District
                </Button>
              </div>
            )}
          </FormBody>

          <FormErrorContainer>{errorMessage}</FormErrorContainer>

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
                Edit Districts
              </Button>
            )}
          </FormFooter>
        </FormFixed>

        <Switch>
          <Route
            path={
              districtsParamRoutes.audio({
                stringKey: ':stringKey',
                subkey: ':subkey',
              }).path
            }
            exact
            component={DistrictAudioPanel}
          />
        </Switch>
      </Body>
    </Viewport>
  );
}

function DistrictRow(props: {
  disabled?: boolean;
  district: District;
  editing: boolean;
  first?: boolean;
  onChange: (district: District) => void;
  onDelete: (districtId: string) => void;
}) {
  const { disabled, district, editing, first, onChange, onDelete } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const districtRoutes = routes.election(electionId).districts;

  return (
    <DistrictRowContainer key={district.id}>
      <InputWithAudio
        audioScreenUrl={
          districtRoutes.audio({
            stringKey: ElectionStringKey.DISTRICT_NAME,
            subkey: district.id,
          }).path
        }
        autoFocus={district.name === ''}
        disabled={disabled}
        editing={editing}
        type="text"
        value={district.name}
        onBlur={(e) => onChange({ ...district, name: e.target.value.trim() })}
        onChange={(e) => onChange({ ...district, name: e.target.value })}
        autoComplete="off"
        required
        style={{ minWidth: 'unset' }}
        tooltipPlacement={first ? 'bottom' : 'top'}
      />

      {editing && (
        <TooltipContainer as="div" style={{ width: 'min-content' }}>
          <Button
            className="input-row-button icon-button"
            disabled={disabled}
            icon="Trash"
            variant="danger"
            fill="transparent"
            onPress={() => onDelete(district.id)}
          />
          <Tooltip alignTo="right" attachTo={first ? 'bottom' : 'top'} bold>
            Delete District
          </Tooltip>
        </TooltipContainer>
      )}
    </DistrictRowContainer>
  );
}

function createBlankDistrict(): District {
  return {
    id: generateId(),
    name: '',
  };
}

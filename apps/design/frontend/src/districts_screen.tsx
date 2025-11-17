import React from 'react';
import { Button, Callout, H1 } from '@votingworks/ui';
import { Switch, Route, useParams, useHistory } from 'react-router-dom';
import { District } from '@votingworks/types';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { Form, Row } from './layout';
import {
  createDistrict,
  deleteDistrict,
  getBallotsFinalizedAt,
  listDistricts,
  updateDistrict,
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
    'districts detail';
  grid-template-columns: minmax(25ch, min(30%, 55ch)) 1fr;
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

const DistrictsForm = styled(Form)`
  display: grid;
  grid-gap: 0;
  grid-area: districts;
  grid-template-rows: 1fr min-content;
  height: 100%;
  width: 100%;
  overflow: hidden;

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
  overflow-y: auto;
  padding: 1rem;
  width: 100%;

  ${cssStyledScrollbars}

  >button {
    flex-shrink: 0;
  }
`;

const DistrictList = styled.div`
  display: grid;
  grid-gap: 1rem;
  grid-template-columns: 1fr;
  width: 100%;
`;

const DistrictRowContainer = styled.div`
  display: flex;
  width: 100%;

  > :has(button):not(:first-child) {
    margin-left: 0.5rem;
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

function DistrictsTab(props: { editing?: boolean }): JSX.Element | null {
  const { editing } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const [newDistricts, setNewDistricts] = React.useState<District[]>([]);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  const updateDistrictMutation = updateDistrict.useMutation();
  const createDistrictMutation = createDistrict.useMutation();
  const deleteDistrictMutation = deleteDistrict.useMutation();
  const history = useHistory();
  // const geographyRoutes = routes.election(electionId).geography;
  // const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  /* istanbul ignore next - @preserve */
  if (!(listDistrictsQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)) {
    return null;
  }

  if (!editing && newDistricts.length > 0) setNewDistricts([]);

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const districts = listDistrictsQuery.data;
  const districtsRoutes = routes.election(electionId).districts;

  function onSubmit() {
    // if (savedDistrict) {
    //   updateDistrictMutation.mutate(
    //     { electionId, updatedDistrict: district },
    //     {
    //       onSuccess: (result) => {
    //         if (result.isOk()) {
    //           goBackToDistrictsList();
    //         }
    //       },
    //     }
    //   );
    // } else {
    //   createDistrictMutation.mutate(
    //     { electionId, newDistrict: district },
    //     {
    //       onSuccess: (result) => {
    //         if (result.isOk()) {
    //           goBackToDistrictsList();
    //         }
    //       },
    //     }
    //   );
    // }
  }

  // function onDelete() {
  //   deleteDistrictMutation.mutate(
  //     { electionId, districtId: assertDefined(savedDistrict).id },
  //     { onSuccess: goBackToDistrictsList }
  //   );
  // }

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

  function setIsEditing(newState: boolean) {
    history.replace(
      newState ? districtsRoutes.edit.path : districtsRoutes.root.path
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
              setNewDistricts([...newDistricts, createBlankDistrict()]);
              setIsEditing(true);
            }}
          >
            Add District
          </Button>
        )}
      </ListActionsRow>
      <DistrictsForm
        data-editing={editing ? 'true' : 'false'}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        onReset={(e) => {
          e.preventDefault();
          setNewDistricts([]);
          setIsEditing(!editing);
        }}
      >
        <Body>
          {errorMessage}
          <DistrictList>
            {districts.map((district, i) => (
              <DistrictRow
                disabled={disabled}
                district={district}
                editing={editing}
                first={i === 0}
                key={district.id}
              />
            ))}
            {newDistricts.map((district, i) => (
              <DistrictRow
                disabled={disabled}
                district={district}
                editing={editing}
                first={districts.length + i === 0}
                key={district.id}
              />
            ))}
          </DistrictList>
          {editing && (
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
          )}
        </Body>
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
              Edit Districts
            </Button>
          )}
        </Footer>
      </DistrictsForm>
    </React.Fragment>
  );
}

function DistrictRow(props: {
  disabled?: boolean;
  district: District;
  editing?: boolean;
  first?: boolean;
}) {
  const { disabled, district, editing, first } = props;

  return (
    <DistrictRowContainer key={district.id}>
      <InputWithAudio
        autoFocus={district.name === ''}
        disabled={disabled}
        editing={editing}
        type="text"
        defaultValue={district.name}
        // onChange={(e) => setDistrict({ ...district, name: e.target.value })}
        onBlur={(e) => {
          e.target.value = e.target.value.trim();
        }}
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
            onPress={() => {}}
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

export function DistrictsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const districtsParamRoutes = electionParamRoutes.districts;
  // const districtsRoutes = routes.election(electionId).districts;
  useTitle(routes.election(electionId).districts.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Districts</H1>
      </Header>
      <MainContent>
        <Switch>
          <Route path={districtsParamRoutes.edit.path}>
            <DistrictsTab editing />
          </Route>
          <Route path={districtsParamRoutes.root.path}>
            <DistrictsTab />
          </Route>
        </Switch>
      </MainContent>
    </ElectionNavScreen>
  );
}

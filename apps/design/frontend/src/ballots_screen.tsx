import {
  H1,
  Table,
  TH,
  TD,
  LinkButton,
  P,
  Icons,
  Button,
} from '@votingworks/ui';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import { find } from '@votingworks/basics';
import {
  BallotLayout,
  BallotPaperSize,
  BallotTargetMarkPosition,
  Election,
} from '@votingworks/types';
import { useState } from 'react';
import { getElection, updateElection } from './api';
import { Form, FormActionsRow, FormField, NestedTr } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { hasSplits } from './geography_screen';
import { BallotScreen } from './ballot_screen';
import { SegmentedControl } from './segmented_control';
import { paperSizeLabels } from './ballot_viewer';
import { RadioGroup } from './radio';
import { TabBar, TabPanel } from './tabs';

const defaultBallotLayout: Required<BallotLayout> = {
  targetMarkPosition: BallotTargetMarkPosition.Left,
  paperSize: BallotPaperSize.Letter,
  layoutDensity: 0,
};

function BallotDesignForm({
  electionId,
  savedElection,
}: {
  electionId: string;
  savedElection: Election;
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [ballotLayout, setBallotLayout] = useState<Required<BallotLayout>>({
    ...defaultBallotLayout,
    ...savedElection.ballotLayout,
  });
  const updateElectionMutation = updateElection.useMutation();

  function onSavePress() {
    updateElectionMutation.mutate(
      {
        electionId,
        election: {
          ...savedElection,
          ballotLayout,
        },
      },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  return (
    <Form>
      <FormField label="Paper Size">
        <RadioGroup
          options={Object.entries(paperSizeLabels).map(([value, label]) => ({
            value,
            label,
          }))}
          value={ballotLayout.paperSize}
          onChange={(paperSize) =>
            setBallotLayout({
              ...ballotLayout,
              paperSize: paperSize as BallotPaperSize,
            })
          }
          disabled={!isEditing}
        />
      </FormField>
      <FormField label="Density">
        <RadioGroup
          options={[
            { value: 0, label: 'Default' },
            { value: 1, label: 'Medium' },
            { value: 2, label: 'Condensed' },
          ]}
          value={ballotLayout.layoutDensity}
          onChange={(layoutDensity) =>
            setBallotLayout({ ...ballotLayout, layoutDensity })
          }
          disabled={!isEditing}
        />
      </FormField>

      <FormField label="Bubble Position">
        <SegmentedControl
          options={[
            { value: BallotTargetMarkPosition.Left, label: 'Left' },
            { value: BallotTargetMarkPosition.Right, label: 'Right' },
          ]}
          value={ballotLayout.targetMarkPosition}
          onChange={(targetMarkPosition) =>
            setBallotLayout({ ...ballotLayout, targetMarkPosition })
          }
          disabled={!isEditing}
        />
      </FormField>
      {isEditing ? (
        <FormActionsRow>
          <Button onPress={() => setIsEditing(false)}>Cancel</Button>
          <Button onPress={onSavePress} variant="primary">
            <Icons.Checkmark /> Save
          </Button>
        </FormActionsRow>
      ) : (
        <FormActionsRow>
          <Button onPress={() => setIsEditing(true)} variant="primary">
            <Icons.Edit /> Edit
          </Button>
        </FormActionsRow>
      )}
    </Form>
  );
}

function BallotStylesTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { precincts, ballotStyles } = getElectionQuery.data;
  const ballotRoutes = routes.election(electionId).ballots;

  return (
    <TabPanel>
      {ballotStyles.length === 0 ? (
        <P>
          VxDesign will create ballot styles for your election once you have
          created districts, precincts, and contests.
        </P>
      ) : (
        <Table style={{ maxWidth: '40rem' }}>
          <thead>
            <tr>
              <TH>Precinct</TH>
              <TH>Ballot Style</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {precincts.flatMap((precinct) => {
              const precinctBallotStyle = ballotStyles.find((ballotStyle) =>
                ballotStyle.precinctsOrSplits.some(
                  ({ precinctId, splitId }) =>
                    precinctId === precinct.id && splitId === undefined
                )
              );
              const precinctRow = (
                <tr key={precinct.id}>
                  <TD>{precinct.name}</TD>
                  <TD>{precinctBallotStyle?.id}</TD>
                  <TD>
                    {precinctBallotStyle && (
                      <LinkButton
                        to={
                          ballotRoutes.viewBallot(
                            precinctBallotStyle.id,
                            precinct.id
                          ).path
                        }
                      >
                        View Ballot
                      </LinkButton>
                    )}
                  </TD>
                </tr>
              );
              if (!hasSplits(precinct)) {
                return [precinctRow];
              }

              const splitRows = precinct.splits.map((split) => {
                const splitBallotStyle = find(ballotStyles, (ballotStyle) =>
                  ballotStyle.precinctsOrSplits.some(
                    ({ precinctId, splitId }) =>
                      precinctId === precinct.id && splitId === split.id
                  )
                );
                return (
                  <NestedTr key={precinct.id + split.id}>
                    <TD>{split.name}</TD>
                    <TD>{splitBallotStyle.id}</TD>
                    <TD>
                      <LinkButton
                        to={
                          ballotRoutes.viewBallot(
                            splitBallotStyle.id,
                            precinct.id
                          ).path
                        }
                      >
                        View Ballot
                      </LinkButton>
                    </TD>
                  </NestedTr>
                );
              });
              return [precinctRow, ...splitRows];
            })}
          </tbody>
        </Table>
      )}
    </TabPanel>
  );
}

function BallotLayoutTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { electionDefinition } = getElectionQuery.data;
  const { election } = electionDefinition;

  return (
    <TabPanel>
      <BallotDesignForm electionId={electionId} savedElection={election} />
    </TabPanel>
  );
}

export function BallotsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const ballotsParamRoutes = electionParamRoutes.ballots;
  const ballotsRoutes = routes.election(electionId).ballots;

  return (
    <Switch>
      <Route
        path={
          ballotsParamRoutes.viewBallot(':ballotStyleId', ':precinctId').path
        }
        exact
        component={BallotScreen}
      />
      <Route path={ballotsParamRoutes.root.path}>
        <ElectionNavScreen electionId={electionId}>
          <H1>Ballots</H1>
          <TabBar
            tabs={[
              {
                label: 'Ballot Styles',
                path: ballotsRoutes.ballotStyles.path,
              },
              {
                label: 'Ballot Layout',
                path: ballotsRoutes.ballotLayout.path,
              },
            ]}
          />
          <Switch>
            <Route
              path={ballotsParamRoutes.ballotStyles.path}
              component={BallotStylesTab}
            />
            <Route
              path={ballotsParamRoutes.ballotLayout.path}
              component={BallotLayoutTab}
            />
            <Redirect
              from={ballotsParamRoutes.root.path}
              to={ballotsParamRoutes.ballotStyles.path}
            />
          </Switch>
        </ElectionNavScreen>
      </Route>
    </Switch>
  );
}

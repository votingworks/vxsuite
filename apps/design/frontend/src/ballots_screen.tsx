import {
  H1,
  Table,
  TH,
  TD,
  LinkButton,
  Button,
  RadioGroup,
  MainContent,
  TabPanel,
  RouterTabBar,
  Font,
  Callout,
} from '@votingworks/ui';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import { find } from '@votingworks/basics';
import { HmpbBallotPaperSize, ElectionId, hasSplits } from '@votingworks/types';
import { useState } from 'react';
import styled from 'styled-components';
import { ballotStyleHasPrecinctOrSplit } from '@votingworks/utils';
import {
  getBallotsFinalizedAt,
  getBallotLayoutSettings,
  updateBallotLayoutSettings,
  listBallotStyles,
  listPrecincts,
  getElectionInfo,
  listParties,
  getStateFeatures,
} from './api';
import { Column, Form, FormActionsRow, NestedTr } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { BallotScreen, paperSizeLabels } from './ballot_screen';
import { useTitle } from './hooks/use_title';
import { BallotsStatus } from './ballots_status';

function BallotDesignForm({
  electionId,
  savedLayoutSettings,
  ballotsFinalizedAt,
}: {
  electionId: ElectionId;
  savedLayoutSettings: {
    paperSize: HmpbBallotPaperSize;
    compact: boolean;
  };
  ballotsFinalizedAt: Date | null;
}): JSX.Element | null {
  const [isEditing, setIsEditing] = useState(false);
  const [layoutSettings, setLayoutSettings] = useState(savedLayoutSettings);

  const updateBallotLayoutSettingsMutation =
    updateBallotLayoutSettings.useMutation();
  const getStateFeaturesQuery = getStateFeatures.useQuery(electionId);

  /* istanbul ignore next - @preserve */
  if (!getStateFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getStateFeaturesQuery.data;

  function onSubmit() {
    updateBallotLayoutSettingsMutation.mutate(
      { electionId, ...layoutSettings },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        setLayoutSettings(savedLayoutSettings);
        setIsEditing(false);
      }}
    >
      <div style={{ maxWidth: '16.5rem' }}>
        <RadioGroup
          label="Paper Size"
          options={Object.entries(paperSizeLabels)
            .filter(([value]) =>
              features.ONLY_LETTER_AND_LEGAL_PAPER_SIZES
                ? value === HmpbBallotPaperSize.Letter ||
                  value === HmpbBallotPaperSize.Legal
                : true
            )
            .map(([value, label]) => ({
              value,
              label,
            }))}
          value={layoutSettings.paperSize}
          onChange={(value) =>
            setLayoutSettings({
              ...layoutSettings,
              paperSize: value as HmpbBallotPaperSize,
            })
          }
          disabled={!isEditing}
        />
      </div>
      <div style={{ maxWidth: '16.5rem' }}>
        <RadioGroup
          label="Density"
          options={[
            {
              label: 'Default',
              value: 'default',
            },
            {
              label: 'Compact',
              value: 'compact',
            },
          ]}
          value={layoutSettings.compact ? 'compact' : 'default'}
          onChange={(value) =>
            setLayoutSettings({
              ...layoutSettings,
              compact: value === 'compact',
            })
          }
          disabled={!isEditing}
        />
      </div>
      {isEditing ? (
        <FormActionsRow>
          <Button type="reset">Cancel</Button>
          <Button type="submit" variant="primary" icon="Done">
            Save
          </Button>
        </FormActionsRow>
      ) : (
        <FormActionsRow>
          <Button
            key="edit"
            variant="primary"
            icon="Edit"
            disabled={!!ballotsFinalizedAt}
            onPress={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </FormActionsRow>
      )}
      {features.ONLY_LETTER_AND_LEGAL_PAPER_SIZES && (
        <Callout
          style={{ alignSelf: 'flex-start' }}
          icon="Info"
          color="neutral"
        >
          Reach out to VotingWorks support if you would prefer a longer paper
          size.
        </Callout>
      )}
    </Form>
  );
}

const BallotStylesTable = styled(Table)`
  td:last-child {
    text-align: right;
    padding-right: 1rem;
  }
`;

function BallotStylesTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const listBallotStylesQuery = listBallotStyles.useQuery(electionId);
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (
    !(
      getElectionInfoQuery.isSuccess &&
      listPrecinctsQuery.isSuccess &&
      listBallotStylesQuery.isSuccess &&
      listPartiesQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess
    )
  ) {
    return null;
  }

  const electionInfo = getElectionInfoQuery.data;
  const precincts = listPrecinctsQuery.data;
  const ballotStyles = listBallotStylesQuery.data;
  const parties = listPartiesQuery.data;
  const ballotRoutes = routes.election(electionId).ballots;

  return (
    <TabPanel>
      <Column style={{ gap: '1rem', maxWidth: '40rem' }}>
        <BallotsStatus />

        {ballotStyles.length > 0 && (
          <BallotStylesTable>
            <thead>
              <tr>
                <TH>Precinct</TH>
                <TH>Ballot Style</TH>
                {electionInfo.type === 'primary' && <TH>Party</TH>}
                <TH />
              </tr>
            </thead>
            <tbody>
              {precincts.flatMap((precinct) => {
                if (!hasSplits(precinct)) {
                  const precinctBallotStyles = ballotStyles.filter(
                    (ballotStyle) => ballotStyle.precincts.includes(precinct.id)
                  );

                  if (precinctBallotStyles.length === 0) {
                    return (
                      <tr key={precinct.id}>
                        <TD>{precinct.name}</TD>
                        <TD>
                          <Font italic>No contests assigned</Font>
                        </TD>
                        {
                          /* istanbul ignore next - @preserve */
                          electionInfo.type === 'primary' && <TD />
                        }
                        <TD />
                      </tr>
                    );
                  }

                  return precinctBallotStyles.map((ballotStyle) => (
                    <tr key={precinct.id + ballotStyle.id}>
                      <TD>{precinct.name}</TD>
                      <TD>{ballotStyle.id}</TD>
                      {electionInfo.type === 'primary' && (
                        <TD>
                          {
                            find(
                              parties,
                              (party) => party.id === ballotStyle.partyId
                            ).fullName
                          }
                        </TD>
                      )}
                      <TD>
                        <LinkButton
                          to={
                            ballotRoutes.viewBallot(ballotStyle.id, precinct.id)
                              .path
                          }
                        >
                          View Ballot
                        </LinkButton>
                      </TD>
                    </tr>
                  ));
                }

                const precinctRow = (
                  <tr key={precinct.id}>
                    <TD>{precinct.name}</TD>
                    <TD />
                    {electionInfo.type === 'primary' && <TD />}
                    <TD />
                  </tr>
                );

                const splitRows = precinct.splits.flatMap((split) => {
                  const splitBallotStyles = ballotStyles.filter((ballotStyle) =>
                    ballotStyleHasPrecinctOrSplit(ballotStyle, {
                      precinct,
                      split,
                    })
                  );

                  if (splitBallotStyles.length === 0) {
                    return (
                      <NestedTr key={split.id}>
                        <TD>{split.name}</TD>
                        <TD>
                          <Font italic>No contests assigned</Font>
                        </TD>
                        {
                          /* istanbul ignore next - @preserve */
                          electionInfo.type === 'primary' && <TD />
                        }
                        <TD />
                      </NestedTr>
                    );
                  }

                  return splitBallotStyles.map((ballotStyle) => (
                    <NestedTr key={split.id + ballotStyle.id}>
                      <TD>{split.name}</TD>
                      <TD>{ballotStyle.id}</TD>
                      {electionInfo.type === 'primary' && (
                        <TD>
                          {
                            find(
                              parties,
                              (party) => party.id === ballotStyle.partyId
                            ).fullName
                          }
                        </TD>
                      )}
                      <TD>
                        <LinkButton
                          to={
                            ballotRoutes.viewBallot(ballotStyle.id, precinct.id)
                              .path
                          }
                        >
                          View Ballot
                        </LinkButton>
                      </TD>
                    </NestedTr>
                  ));
                });

                return [precinctRow, ...splitRows];
              })}
            </tbody>
          </BallotStylesTable>
        )}
      </Column>
    </TabPanel>
  );
}

function BallotLayoutTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getBallotLayoutSettingsQuery =
    getBallotLayoutSettings.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (
    !(
      getBallotLayoutSettingsQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess
    )
  ) {
    return null;
  }

  const layoutSettings = getBallotLayoutSettingsQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;

  return (
    <TabPanel>
      <BallotDesignForm
        electionId={electionId}
        savedLayoutSettings={layoutSettings}
        ballotsFinalizedAt={ballotsFinalizedAt}
      />
    </TabPanel>
  );
}

export function BallotsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const ballotsParamRoutes = electionParamRoutes.ballots;
  const ballotsRoutes = routes.election(electionId).ballots;
  useTitle(routes.election(electionId).ballots.root.title);

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
          <Header>
            <H1>Proof Ballots</H1>
          </Header>
          <MainContent>
            <RouterTabBar
              tabs={[ballotsRoutes.ballotStyles, ballotsRoutes.ballotLayout]}
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
          </MainContent>
        </ElectionNavScreen>
      </Route>
    </Switch>
  );
}

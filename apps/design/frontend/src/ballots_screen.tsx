import {
  H1,
  Table,
  TH,
  TD,
  LinkButton,
  P,
  Button,
  RadioGroup,
  MainHeader,
  MainContent,
  TabPanel,
  RouterTabBar,
  H3,
  Card,
  Icons,
  Modal,
  Font,
  Callout,
} from '@votingworks/ui';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';
import {
  HmpbBallotPaperSize,
  getPartyForBallotStyle,
  ElectionId,
  hasSplits,
} from '@votingworks/types';
import React, { useState } from 'react';
import styled from 'styled-components';
import {
  getElection,
  getBallotsFinalizedAt,
  finalizeBallots,
  getUserFeatures,
  getBallotPaperSize,
  updateBallotPaperSize,
} from './api';
import { Column, Form, FormActionsRow, NestedTr, Row } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { BallotScreen, paperSizeLabels } from './ballot_screen';
import { useTitle } from './hooks/use_title';

function BallotDesignForm({
  electionId,
  savedPaperSize,
  ballotsFinalizedAt,
}: {
  electionId: ElectionId;
  savedPaperSize: HmpbBallotPaperSize;
  ballotsFinalizedAt: Date | null;
}): JSX.Element | null {
  const [isEditing, setIsEditing] = useState(false);
  const [paperSize, setPaperSize] = useState(savedPaperSize);
  const updateBallotPaperSizeMutation = updateBallotPaperSize.useMutation();
  const getUserFeaturesQuery = getUserFeatures.useQuery();

  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

  function onSubmit() {
    updateBallotPaperSizeMutation.mutate(
      { electionId, paperSize },
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
        setPaperSize(savedPaperSize);
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
          value={paperSize}
          onChange={(value) => setPaperSize(value as HmpbBallotPaperSize)}
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

const FinalizeBallotsCallout = styled(Card).attrs({ color: 'neutral' })`
  h3 {
    margin: 0 !important;
    line-height: 0.8;
  }
`;

const BallotStylesTable = styled(Table)`
  td:last-child {
    text-align: right;
    padding-right: 1rem;
  }
`;

function BallotStylesTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionQuery = getElection.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const finalizeBallotsMutation = finalizeBallots.useMutation();
  const [isConfirmingFinalize, setIsConfirmingFinalize] = useState(false);

  if (!(getElectionQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)) {
    return null;
  }

  const { election, precincts, ballotStyles } = getElectionQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const ballotRoutes = routes.election(electionId).ballots;

  return (
    <TabPanel>
      {ballotStyles.length === 0 ? (
        <P>
          VxDesign will create ballot styles for your election once you have
          created districts, precincts, and contests.
        </P>
      ) : (
        <Column style={{ gap: '1rem', maxWidth: '40rem' }}>
          <FinalizeBallotsCallout>
            <Row
              style={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Row style={{ gap: '0.5rem' }}>
                {ballotsFinalizedAt ? (
                  <React.Fragment>
                    <Icons.Done color="primary" />
                    <H3>Ballots are Finalized</H3>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <Icons.Info />
                    <div>
                      <H3>Ballots are Not Finalized</H3>
                      <div style={{ marginTop: '0.5rem' }}>
                        Proof each ballot style, then finalize ballots.
                      </div>
                    </div>
                  </React.Fragment>
                )}
              </Row>
              <Button
                icon="Done"
                color="primary"
                fill="outlined"
                disabled={
                  ballotsFinalizedAt !== null ||
                  finalizeBallotsMutation.isLoading
                }
                onPress={() => setIsConfirmingFinalize(true)}
              >
                Finalize Ballots
              </Button>
            </Row>
          </FinalizeBallotsCallout>
          {isConfirmingFinalize && (
            <Modal
              title="Confirm Finalize Ballots"
              content={
                <P>
                  Once ballots are finalized, the election may not be edited
                  further.
                </P>
              }
              actions={
                <React.Fragment>
                  <Button
                    icon="Done"
                    onPress={() =>
                      finalizeBallotsMutation.mutate(
                        { electionId },
                        { onSuccess: () => setIsConfirmingFinalize(false) }
                      )
                    }
                    variant="primary"
                  >
                    Finalize Ballots
                  </Button>
                  <Button onPress={() => setIsConfirmingFinalize(false)}>
                    Cancel
                  </Button>
                </React.Fragment>
              }
              onOverlayClick={
                /* istanbul ignore next - manually tested */
                () => setIsConfirmingFinalize(false)
              }
            />
          )}

          <BallotStylesTable>
            <thead>
              <tr>
                <TH>Precinct</TH>
                <TH>Ballot Style</TH>
                {election.type === 'primary' && <TH>Party</TH>}
                <TH />
              </tr>
            </thead>
            <tbody>
              {precincts.flatMap((precinct) => {
                if (!hasSplits(precinct)) {
                  const precinctBallotStyles = ballotStyles.filter(
                    (ballotStyle) =>
                      ballotStyle.precinctsOrSplits.some(
                        ({ precinctId, splitId }) =>
                          precinctId === precinct.id && splitId === undefined
                      )
                  );

                  if (precinctBallotStyles.length === 0) {
                    return (
                      <NestedTr key={precinct.id}>
                        <TD>{precinct.name}</TD>
                        <TD>
                          <Font italic>No contests assigned</Font>
                        </TD>
                        {election.type === 'primary' && <TD />}
                        <TD />
                      </NestedTr>
                    );
                  }

                  return precinctBallotStyles.map((ballotStyle) => (
                    <tr key={precinct.id + ballotStyle.id}>
                      <TD>{precinct.name}</TD>
                      <TD>{ballotStyle.id}</TD>
                      {election.type === 'primary' && (
                        <TD>
                          {
                            assertDefined(
                              getPartyForBallotStyle({
                                election,
                                ballotStyleId: ballotStyle.id,
                              })
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
                    {election.type === 'primary' && <TD />}
                    <TD />
                  </tr>
                );

                const splitRows = precinct.splits.flatMap((split) => {
                  const splitBallotStyles = ballotStyles.filter((ballotStyle) =>
                    ballotStyle.precinctsOrSplits.some(
                      ({ precinctId, splitId }) =>
                        precinctId === precinct.id && splitId === split.id
                    )
                  );

                  if (splitBallotStyles.length === 0) {
                    return (
                      <NestedTr key={split.id}>
                        <TD>{split.name}</TD>
                        <TD>
                          <Font italic>No contests assigned</Font>
                        </TD>
                        {election.type === 'primary' && <TD />}
                        <TD />
                      </NestedTr>
                    );
                  }

                  return splitBallotStyles.map((ballotStyle) => (
                    <NestedTr key={split.id + ballotStyle.id}>
                      <TD>{split.name}</TD>
                      <TD>{ballotStyle.id}</TD>
                      {election.type === 'primary' && (
                        <TD>
                          {
                            getPartyForBallotStyle({
                              election,
                              ballotStyleId: ballotStyle.id,
                            })?.name
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
        </Column>
      )}
    </TabPanel>
  );
}

function BallotLayoutTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getBallotPaperSizeQuery = getBallotPaperSize.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (
    !(getBallotPaperSizeQuery.isSuccess && getBallotsFinalizedAtQuery.isSuccess)
  ) {
    return null;
  }

  const paperSize = getBallotPaperSizeQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;

  return (
    <TabPanel>
      <BallotDesignForm
        electionId={electionId}
        savedPaperSize={paperSize}
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
          <MainHeader>
            <H1>Proof Ballots</H1>
          </MainHeader>
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

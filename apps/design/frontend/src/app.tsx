import './polyfills';
import React, { FormEvent } from 'react';
import {
  AppBase,
  Button,
  Font,
  H1,
  H2,
  LabelledText,
  LinkButton,
  Main,
  P,
  Screen,
  Table,
  TD,
  TH,
} from '@votingworks/ui';
import {
  BrowserRouter,
  Redirect,
  Route,
  Switch,
  useParams,
  Link,
} from 'react-router-dom';
import fileDownload from 'js-file-download';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  ElectionDefinition,
  getBallotStyle,
  getDisplayElectionHash,
  getPrecinctById,
} from '@votingworks/types';
import styled, { useTheme } from 'styled-components';
import { formatShortDate } from '@votingworks/utils';
import { DateTime } from 'luxon';
import { assertDefined } from '@votingworks/basics';
import { FileInputButton } from './file_input_button';
import {
  ApiClientContext,
  createApiClient,
  createQueryClient,
  exportAllBallots,
  exportBallotDefinition,
  getElection,
  setElection,
} from './api';
import { BallotViewer } from './ballot_viewer';

const Row = styled.div`
  display: flex;
  flex-direction: row;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
`;

const ElectionInfoContainer = styled(Row)`
  align-items: center;
  gap: 1rem;
  justify-content: start;
`;

function ElectionInfo({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition;
}): JSX.Element {
  const { election } = electionDefinition;
  const { title, date, county, state } = election;
  const electionDate = formatShortDate(DateTime.fromISO(date));

  const electionInfoLabel = (
    <React.Fragment>
      <Font noWrap>{county.name},</Font> <Font noWrap>{state}</Font>
    </React.Fragment>
  );

  const electionInfo = (
    <div>
      <LabelledText labelPosition="bottom" label={electionInfoLabel}>
        <Font weight="bold">{title}</Font> — <Font noWrap>{electionDate}</Font>
      </LabelledText>
    </div>
  );

  const electionIdInfo = (
    <div>
      <LabelledText label="Election ID">
        <Font weight="bold">{getDisplayElectionHash(electionDefinition)}</Font>
      </LabelledText>
    </div>
  );

  return (
    <ElectionInfoContainer>
      {electionInfo}
      {electionIdInfo}
    </ElectionInfoContainer>
  );
}

function Header(): JSX.Element {
  const theme = useTheme();
  return (
    <Row
      style={{
        justifyContent: 'space-between',
        background: theme.colors.foreground,
        color: theme.colors.background,
        padding: '0.6rem 1rem',
        alignItems: 'center',
      }}
    >
      <H1 style={{ marginBottom: 0 }}>
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          VxDesign
        </Link>
      </H1>
    </Row>
  );
}

function LoadElectionScreen(): JSX.Element {
  const setElectionMutation = setElection.useMutation();

  async function onSelectElectionFile(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    const file = files[0];
    const contents = await file.text();
    setElectionMutation.mutate({ electionData: contents });
  }

  return (
    <Screen>
      <Main centerChild>
        <H1>VxDesign</H1>
        <P>Load an election to begin</P>
        <FileInputButton
          accept=".json"
          onChange={onSelectElectionFile}
          disabled={setElectionMutation.isLoading}
          buttonProps={{ variant: 'primary' }}
        >
          Select Election
        </FileInputButton>
      </Main>
    </Screen>
  );
}

function HomeScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const setElectionMutation = setElection.useMutation();
  const exportAllBallotsMutation = exportAllBallots.useMutation();
  const exportBallotDefinitionMutation = exportBallotDefinition.useMutation();

  if (!getElectionQuery.isSuccess) {
    return null; // Initial loading state
  }

  const electionDefinition = getElectionQuery.data;

  if (!electionDefinition) {
    return <LoadElectionScreen />;
  }

  const { election } = electionDefinition;
  const ballots = election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map((precinctId) => ({
      precinct: assertDefined(getPrecinctById({ election, precinctId })),
      ballotStyle,
    }))
  );

  function onPressClearElection() {
    setElectionMutation.mutate({ electionData: undefined });
  }

  function onPressExportAllBallots() {
    exportAllBallotsMutation.mutate(undefined, {
      onSuccess: (zipContents) => {
        fileDownload(zipContents, 'ballots.zip');
      },
    });
  }

  function onPressExportBallotDefinition() {
    exportBallotDefinitionMutation.mutate(undefined, {
      onSuccess: (ballotDefinition) => {
        fileDownload(
          JSON.stringify(ballotDefinition),
          'ballot-definition.json'
        );
      },
    });
  }

  return (
    <Screen>
      <Header />
      <Main padded>
        <Column style={{ gap: '2rem' }}>
          <section>
            <H2>Election</H2>
            <Row style={{ gap: '1rem' }}>
              <ElectionInfo electionDefinition={electionDefinition} />
              <Button
                onPress={onPressClearElection}
                variant="danger"
                disabled={setElectionMutation.isLoading}
              >
                Clear Election
              </Button>
            </Row>
          </section>
          <section style={{ maxWidth: '40rem' }}>
            <H2>Ballots</H2>
            <Table>
              <thead>
                <tr>
                  <TH>Precinct</TH>
                  <TH>Ballot Style</TH>
                  <TH />
                </tr>
              </thead>
              <tbody>
                {ballots.map(({ ballotStyle, precinct }) => (
                  <tr key={ballotStyle.id + precinct.id}>
                    <TD>{precinct.name}</TD>
                    <TD>{ballotStyle.id}</TD>
                    <TD>
                      <LinkButton
                        to={`/ballot/${precinct.id}/${ballotStyle.id}`}
                      >
                        View Ballot
                      </LinkButton>{' '}
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
          <section>
            <H2>Export</H2>
            <P>
              <Button
                variant="primary"
                onPress={onPressExportAllBallots}
                disabled={exportAllBallotsMutation.isLoading}
              >
                Export All Ballots
              </Button>
            </P>
            <P>
              <Button
                variant="primary"
                onPress={onPressExportBallotDefinition}
                disabled={exportBallotDefinitionMutation.isLoading}
              >
                Export Ballot Definition
              </Button>
            </P>
            <P>
              <Button
                disabled
                onPress={() => {
                  // TODO
                }}
              >
                Export L&A Test Deck
              </Button>
            </P>
          </section>
        </Column>
      </Main>
    </Screen>
  );
}

function BallotScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const { precinctId, ballotStyleId } = useParams<{
    precinctId: string;
    ballotStyleId: string;
  }>();

  if (!getElectionQuery.isSuccess) {
    return null; // Initial loading state
  }

  const electionDefinition = getElectionQuery.data;
  if (!electionDefinition) {
    return <Redirect to="/" />;
  }

  const { election } = electionDefinition;

  const precinct = getPrecinctById({ election, precinctId });
  const ballotStyle = getBallotStyle({ election, ballotStyleId });
  if (!(precinct && ballotStyle)) {
    return <Redirect to="/" />;
  }

  return (
    <Screen>
      <Header />
      <Main>
        <BallotViewer
          election={election}
          precinct={precinct}
          ballotStyle={ballotStyle}
        />
      </Main>
    </Screen>
  );
}

export function App(): JSX.Element {
  return (
    <AppBase>
      <ApiClientContext.Provider value={createApiClient()}>
        <QueryClientProvider client={createQueryClient()}>
          <BrowserRouter>
            <Switch>
              <Route path="/" exact component={HomeScreen} />
              <Route
                path="/ballot/:precinctId/:ballotStyleId"
                component={BallotScreen}
              />
            </Switch>
          </BrowserRouter>
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </AppBase>
  );
}

import { useHistory, useParams } from 'react-router-dom';
import {
  ElectionNavScreen,
  type ElectionIdParams,
  Header,
  listBallotStyles,
  listPrecincts,
  useDesignRoutes,
} from '@votingworks/design-ui';
import {
  Button,
  Callout,
  H1,
  H2,
  LinkButton,
  MainContent,
  P,
  ProgressBar,
  Table,
  TD,
  TH,
} from '@votingworks/ui';
import { routerPaths } from '../router_paths.js';
import {
  discardDesign,
  finalizeBallots,
  getCurrentDesign,
  unfinalizeBallots,
} from './design_api.js';
import { configureFromDesign } from '../api.js';

export function DesignBallotsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const history = useHistory();
  const routes = useDesignRoutes();
  const ballotStylesQuery = listBallotStyles.useQuery(electionId);
  const precinctsQuery = listPrecincts.useQuery(electionId);
  const currentDesignQuery = getCurrentDesign.useQuery();
  const finalizeMutation = finalizeBallots.useMutation();
  const unfinalizeMutation = unfinalizeBallots.useMutation();
  const discardMutation = discardDesign.useMutation();
  const configureMutation = configureFromDesign.useMutation();

  if (
    !ballotStylesQuery.isSuccess ||
    !precinctsQuery.isSuccess ||
    !currentDesignQuery.isSuccess ||
    !currentDesignQuery.data
  ) {
    return null;
  }

  const {
    ballotsFinalizedAt,
    export: designExport,
    activated,
  } = currentDesignQuery.data;
  const isRendering = designExport?.status === 'running';
  const isRendered =
    !!ballotsFinalizedAt && designExport?.status === 'complete';
  const configureResult = configureMutation.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Ballots</H1>
      </Header>
      <MainContent>
        <H2>Proof Ballots</H2>
        <Table>
          <thead>
            <tr>
              <TH>Precinct</TH>
              <TH>Ballot Style</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {precinctsQuery.data.flatMap((precinct) =>
              ballotStylesQuery.data
                .filter((ballotStyle) =>
                  ballotStyle.precincts.includes(precinct.id)
                )
                .map((ballotStyle) => (
                  <tr key={precinct.id + ballotStyle.id}>
                    <TD>{precinct.name}</TD>
                    <TD>{ballotStyle.id}</TD>
                    <TD>
                      <LinkButton
                        to={
                          routes
                            .election(electionId)
                            .ballots.viewBallot(ballotStyle.id, precinct.id)
                            .path
                        }
                      >
                        View Ballot
                      </LinkButton>
                    </TD>
                  </tr>
                ))
            )}
          </tbody>
        </Table>

        {activated ? (
          <Callout color="neutral" icon="Info">
            This election is activated. The design is read-only until VxAdmin is
            unconfigured.
          </Callout>
        ) : (
          <div>
            <H2>Finalize</H2>
            {ballotsFinalizedAt ? (
              <P>Ballots finalized at {ballotsFinalizedAt.toLocaleString()}.</P>
            ) : (
              <P>
                Finalizing locks the design and renders every ballot. Unfinalize
                to make changes.
              </P>
            )}
            {isRendering && designExport.progress && (
              <div>
                <P>
                  {designExport.progress.label} (
                  {designExport.progress.progress}/{designExport.progress.total}
                  )
                </P>
                <ProgressBar
                  progress={
                    designExport.progress.progress /
                    (designExport.progress.total || 1)
                  }
                />
              </div>
            )}
            {designExport?.status === 'failed' && (
              <Callout color="danger" icon="Danger">
                Rendering failed: {designExport.error}
              </Callout>
            )}
            <P>
              {ballotsFinalizedAt ? (
                <Button
                  onPress={() => unfinalizeMutation.mutate({ electionId })}
                  disabled={isRendering || unfinalizeMutation.isLoading}
                >
                  Unfinalize Ballots
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon="Done"
                  onPress={() => finalizeMutation.mutate({ electionId })}
                  disabled={finalizeMutation.isLoading}
                >
                  Finalize Ballots
                </Button>
              )}{' '}
              <Button
                variant="danger"
                icon="Delete"
                onPress={() =>
                  discardMutation.mutate(undefined, {
                    onSuccess: () => history.push(routes.root.path),
                  })
                }
                disabled={isRendering || discardMutation.isLoading}
              >
                Discard Election
              </Button>
            </P>

            {isRendered && (
              <div>
                <H2>Activate</H2>
                <P>
                  Activating configures VxAdmin for this election. Then use Save
                  Election Package on the Election screen to save the signed
                  package.
                </P>
                <P>
                  <Button
                    variant="primary"
                    onPress={() =>
                      configureMutation.mutate(
                        { designElectionId: electionId },
                        {
                          onSuccess: (result) => {
                            if (result.isOk()) {
                              history.push(routerPaths.election);
                            }
                          },
                        }
                      )
                    }
                    disabled={configureMutation.isLoading}
                  >
                    Activate Election
                  </Button>
                </P>
                {configureResult?.isErr() && (
                  <Callout color="danger" icon="Danger">
                    {'message' in configureResult.err()
                      ? (configureResult.err() as Error).message
                      : JSON.stringify(configureResult.err())}
                  </Callout>
                )}
              </div>
            )}
          </div>
        )}
      </MainContent>
    </ElectionNavScreen>
  );
}

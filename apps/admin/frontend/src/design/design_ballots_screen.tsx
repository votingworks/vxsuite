import { useContext } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
  ElectionNavScreen,
  type ElectionIdParams,
  getBallotsFinalizedAt,
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
import { AppContext } from '../contexts/app_context.js';
import { routerPaths } from '../router_paths.js';
import {
  finalizeAndExportBallots,
  getElectionPackage,
  unfinalizeBallots,
} from './design_api.js';
import { configureFromDesign } from '../api.js';

export function DesignBallotsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const history = useHistory();
  const routes = useDesignRoutes();
  const { electionDefinition } = useContext(AppContext);
  const ballotStylesQuery = listBallotStyles.useQuery(electionId);
  const precinctsQuery = listPrecincts.useQuery(electionId);
  const finalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const electionPackageQuery = getElectionPackage.useQuery(electionId);
  const finalizeMutation = finalizeAndExportBallots.useMutation();
  const unfinalizeMutation = unfinalizeBallots.useMutation();
  const configureMutation = configureFromDesign.useMutation();

  if (
    !ballotStylesQuery.isSuccess ||
    !precinctsQuery.isSuccess ||
    !finalizedAtQuery.isSuccess ||
    !electionPackageQuery.isSuccess
  ) {
    return null;
  }

  const finalizedAt = finalizedAtQuery.data;
  const { task, electionPackageUrl } = electionPackageQuery.data;
  const isExporting = !!task && !task.completedAt;
  const isExported =
    !!finalizedAt &&
    !!task?.completedAt &&
    !task.error &&
    !!electionPackageUrl &&
    task.createdAt >= finalizedAt;
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

        <H2>Finalize and Export</H2>
        {finalizedAt ? (
          <P>Ballots finalized at {finalizedAt.toLocaleString()}.</P>
        ) : (
          <P>Ballots are not finalized. Finalizing renders every ballot.</P>
        )}
        {isExporting && task.progress && (
          <div>
            <P>
              {task.progress.label} ({task.progress.progress}/
              {task.progress.total})
            </P>
            <ProgressBar
              progress={task.progress.progress / (task.progress.total || 1)}
            />
          </div>
        )}
        {task?.error && (
          <Callout color="danger" icon="Danger">
            Export failed: {task.error}
          </Callout>
        )}
        <P>
          {finalizedAt ? (
            <Button
              onPress={() => unfinalizeMutation.mutate({ electionId })}
              disabled={isExporting || unfinalizeMutation.isLoading}
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
              Finalize and Export Ballots
            </Button>
          )}
        </P>

        {isExported && (
          <div>
            <P>
              Ballots are rendered. Configure VxAdmin for this election, then
              use Save Election Package on the Election screen to save the
              signed package.
            </P>

            <H2>Configure VxAdmin</H2>
            {electionDefinition ? (
              <P>
                VxAdmin is configured for another election. Unconfigure VxAdmin
                before configuring it for this design.
              </P>
            ) : (
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
                  Configure VxAdmin for This Election
                </Button>
              </P>
            )}
            {configureResult?.isErr() && (
              <Callout color="danger" icon="Danger">
                {'message' in configureResult.err()
                  ? (configureResult.err() as Error).message
                  : JSON.stringify(configureResult.err())}
              </Callout>
            )}
          </div>
        )}
      </MainContent>
    </ElectionNavScreen>
  );
}

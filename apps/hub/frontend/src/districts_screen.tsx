import { H1 } from '@votingworks/ui';
import { Switch, Route, useParams, useHistory } from 'react-router-dom';
import { ElectionStringKey } from '@votingworks/types';
import { DistrictsEditor } from '@votingworks/election-definition-ui';
import { ElectionNavScreen, Header } from './nav_screen.js';
import {
  type ElectionIdParams,
  electionParamRoutes,
  routes,
} from './routes.js';
import { getBallotsFinalizedAt } from './api.js';
import { useTitle } from './hooks/use_title.js';
import { DistrictAudioPanel } from './district_audio_panel.js';

export function DistrictsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const districtParamRoutes = electionParamRoutes.districts;

  const { title } = districtParamRoutes.root;
  useTitle(title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      <Switch>
        <Route path={districtParamRoutes.edit.path}>
          <Contents editing />
        </Route>
        <Route path={districtParamRoutes.root.path}>
          <Contents editing={false} />
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}

function Contents(props: { editing: boolean }): JSX.Element | null {
  const { editing } = props;
  const { electionId } = useParams<ElectionIdParams>();
  const history = useHistory();
  const districtsRoutes = routes.election(electionId).districts;
  const districtsParamRoutes = electionParamRoutes.districts;

  const ballotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (!ballotsFinalizedAtQuery.isSuccess) {
    return null;
  }

  return (
    <DistrictsEditor
      electionId={electionId}
      editing={editing}
      onEditingChange={(switchToEdit) =>
        history.replace(
          switchToEdit ? districtsRoutes.edit.path : districtsRoutes.root.path
        )
      }
      isLocked={!!ballotsFinalizedAtQuery.data}
      audioScreenUrl={(districtId) =>
        districtsRoutes.audio({
          stringKey: ElectionStringKey.DISTRICT_NAME,
          subkey: districtId,
        })
      }
    >
      <Switch>
        <Route
          path={districtsParamRoutes.audio({
            stringKey: ':stringKey',
            subkey: ':subkey',
          })}
          exact
          component={DistrictAudioPanel}
        />
      </Switch>
    </DistrictsEditor>
  );
}

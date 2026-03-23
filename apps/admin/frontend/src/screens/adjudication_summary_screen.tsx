import { Redirect, Route, Switch } from 'react-router-dom';
import { RouterTabBar } from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { AdjudicationWriteInsTab } from './adjudication_write_ins_tab';
import { AdjudicationNetworkTab } from './adjudication_network_tab';

export function AdjudicationSummaryScreen(): JSX.Element {
  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  if (!isMultiStationEnabled) {
    return (
      <NavigationScreen title="Adjudication">
        <AdjudicationWriteInsTab />
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen title="Adjudication">
      <RouterTabBar
        tabs={[
          { title: 'Write-Ins', path: routerPaths.adjudicationWriteIns },
          { title: 'Network', path: routerPaths.adjudicationNetwork },
        ]}
      />
      <Switch>
        <Route exact path={routerPaths.adjudicationWriteIns}>
          <AdjudicationWriteInsTab />
        </Route>
        <Route exact path={routerPaths.adjudicationNetwork}>
          <AdjudicationNetworkTab />
        </Route>
        <Redirect
          exact
          from={routerPaths.adjudication}
          to={routerPaths.adjudicationWriteIns}
        />
      </Switch>
    </NavigationScreen>
  );
}

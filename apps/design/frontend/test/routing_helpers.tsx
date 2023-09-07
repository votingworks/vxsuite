import React from 'react';
import { Route, Router } from 'react-router-dom';
import { createMemoryHistory, History } from 'history';

export function withRoute(
  ui: React.ReactElement,
  {
    paramPath = '/',
    path = '/',
    history = createMemoryHistory({ initialEntries: [path] }),
  }: { paramPath?: string; path?: string; history?: History }
): JSX.Element {
  return (
    <Router history={history}>
      <Route path={paramPath}>{ui}</Route>
    </Router>
  );
}

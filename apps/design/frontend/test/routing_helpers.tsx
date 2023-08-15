import React from 'react';
import { Route, Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';

export function withRouter(ui: React.ReactElement, path = '/'): JSX.Element {
  return (
    <Router history={createMemoryHistory({ initialEntries: [path] })}>
      {ui}
    </Router>
  );
}

export function withRoute(
  ui: React.ReactElement,
  paramPath = '/',
  path = '/'
): JSX.Element {
  return withRouter(<Route path={paramPath}>{ui}</Route>, path);
}

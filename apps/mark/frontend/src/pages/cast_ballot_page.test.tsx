import React from 'react';
import { Route } from 'react-router-dom';

import { render } from '../../test/test_utils';

import { CastBallotPage } from './cast_ballot_page';

it('renders CastBallotPage', () => {
  const { container } = render(<Route path="/" component={CastBallotPage} />, {
    route: '/',
  });
  expect(container.firstChild).toMatchSnapshot();
});

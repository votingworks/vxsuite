import React from 'react';
import { render, screen } from '../test/react_testing_library';

import { FullScreenIconWrapper, Icons } from './icons';

for (const [name, Component] of Object.entries(Icons)) {
  if (typeof Component !== 'function') {
    continue;
  }

  test(`Icons.${name} renders with no props`, () => {
    render(<Component />);

    screen.getByRole('img', { hidden: true });
  });
}

test('FullScreenIconWrapper renders child icon - portrait screen', () => {
  global.innerHeight = 1920;
  global.innerWidth = 1080;

  render(
    <FullScreenIconWrapper>
      <Icons.Info />
    </FullScreenIconWrapper>
  );

  screen.getByRole('img', { hidden: true });
});

// Testing both screen orientations to satisfy code coverage requirements:
test('FullScreenIconWrapper renders child icon - landscape screen', () => {
  global.innerHeight = 1080;
  global.innerWidth = 1920;

  render(
    <FullScreenIconWrapper color="danger">
      <Icons.Info />
    </FullScreenIconWrapper>
  );

  screen.getByRole('img', { hidden: true });
});

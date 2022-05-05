import { screen } from '@testing-library/react';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsScreen } from './write_ins_screen';

test('write-ins screen', () => {
  renderInAppContext(<WriteInsScreen />);
  screen.getByText('Adjudication can begin once CVRs are imported.');
  expect(
    screen.getByText('Adjudicate write-ins for "United States President"')
  ).toBeDisabled();
});

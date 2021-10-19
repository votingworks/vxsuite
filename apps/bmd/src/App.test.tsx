import * as React from 'react';
import { fakeKiosk } from '@votingworks/test-utils';
import { render } from '../test/testUtils';
import App from './App';
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';

it('prevents context menus from appearing', async () => {
  jest.useFakeTimers();
  render(<App machineConfig={fakeMachineConfigProvider()} />);

  const { oncontextmenu } = window;

  if (oncontextmenu) {
    const event = new MouseEvent('contextmenu');

    jest.spyOn(event, 'preventDefault');
    oncontextmenu.call(window, event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  }

  await advanceTimersAndPromises();
});

it('uses kiosk storage when in kiosk-browser', async () => {
  jest.useFakeTimers();
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;
  render(<App machineConfig={fakeMachineConfigProvider()} />);
  await advanceTimersAndPromises();
  expect(kiosk.storage.get).toHaveBeenCalled();
});

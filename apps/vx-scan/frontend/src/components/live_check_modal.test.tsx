import React from 'react';

import MockDate from 'mockdate';

import { fireEvent, waitFor } from '@testing-library/react';
import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';

import { fakeKiosk, Inserted } from '@votingworks/test-utils';

import { LiveCheckModal } from './live_check_modal';
import { renderInAppContext } from '../../test/helpers/render_in_app_context';
import { machineConfig } from '../../test/helpers/mock_api_client';

const auth = Inserted.fakePollWorkerAuth();

MockDate.set('2022-06-22T01:23:45.678Z');

test('renders livecheck screen', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.sign.mockResolvedValueOnce('fakesignature');

  const closeFn = jest.fn();
  const { getByText, unmount } = renderInAppContext(
    <LiveCheckModal
      electionDefinition={electionDefinition}
      onClose={closeFn}
    />,
    { auth }
  );

  await waitFor(() => {
    expect(mockKiosk.sign).toHaveBeenCalledTimes(1);
  });

  expect(mockKiosk.sign).toHaveBeenCalledWith({
    signatureType: 'lc',
    payload: `${machineConfig.machineId}|1655861025678|${electionDefinition.electionHash}`,
  });

  getByText('Live Check');

  fireEvent.click(getByText('Done'));
  expect(closeFn).toHaveBeenCalled();

  unmount();
});

import { Buffer } from 'buffer';
import fetchMock from 'fetch-mock';

import { fakeKiosk } from '@votingworks/test-utils';
import { assert } from '@votingworks/utils';
import { Optional } from '@votingworks/types';
import { download } from './download';

let oldLocation: typeof window.location;

beforeEach(() => {
  oldLocation = window.location;
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
      ...oldLocation,
      assign: jest.fn(),
    },
  });
});

afterEach(() => {
  window.location = oldLocation;
  delete window.kiosk;
});

test('outside kiosk browser', async () => {
  expect(window.kiosk).toBeUndefined();

  let clickedLink: Optional<HTMLAnchorElement>;
  document.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      clickedLink = event.target;
    }
  });

  await download('/a/url');

  expect(clickedLink).toBeDefined();
  assert(clickedLink);
  expect(clickedLink.href).toEqual(`${window.location.href}a/url`);
  expect(clickedLink.download).toBeDefined();
});

test('kiosk browser successful download', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  const write = jest.fn();
  const end = jest.fn();
  kiosk.saveAs.mockResolvedValueOnce({ filename: '/fake/file', write, end });

  fetchMock.getOnce('/a/url', 'abcdefg');
  await download('/a/url');
  expect(write).toHaveBeenCalledWith(Buffer.from('abcdefg'));
  expect(end).toHaveBeenCalled();
});

import { fakeKiosk } from '@votingworks/test-utils';
import { KioskStorage } from './kiosk_storage';

it('can remove a value', async () => {
  const kiosk = fakeKiosk();
  const storage = new KioskStorage(kiosk);

  await storage.remove('a');
  expect(kiosk.storage.remove).toHaveBeenCalledWith('a');
});

it('can clear all values', async () => {
  const kiosk = fakeKiosk();
  const storage = new KioskStorage(kiosk);

  await storage.clear();
  expect(kiosk.storage.clear).toHaveBeenCalled();
});

it('can set a value', async () => {
  const kiosk = fakeKiosk();
  const storage = new KioskStorage(kiosk);
  const object = { b: 1 } as const;

  await storage.set('a', object);
  expect(kiosk.storage.set).toHaveBeenCalledWith('a', object);
});

it('can get a value', async () => {
  const kiosk = fakeKiosk();
  const storage = new KioskStorage(kiosk);
  kiosk.storage.get = jest.fn().mockResolvedValueOnce('value');

  expect(await storage.get('a')).toEqual('value');
  expect(kiosk.storage.get).toHaveBeenCalledWith('a');
});

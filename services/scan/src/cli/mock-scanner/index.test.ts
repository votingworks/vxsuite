import nock from 'nock';
import { main as mockScanner } from '.';

beforeEach(() => {
  nock.disableNetConnect();
  nock.cleanAll();
});

test('no command error', async () => {
  jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  expect(await mockScanner([])).toEqual(-1);
  expect(process.stderr.write).toHaveBeenCalled();
});

test('load', async () => {
  nock('http://localhost:9999/').put('/mock').reply(200, { status: 'ok' });
  expect(
    await mockScanner(['load', 'path/to/front.jpg', 'path/to/back.jpg'])
  ).toEqual(0);
  expect(nock.activeMocks()).toHaveLength(0);
});

test('load error', async () => {
  nock('http://localhost:9999/').put('/mock').reply(200, { status: 'ok' });
  expect(await mockScanner(['load', 'path/to/only.jpg'])).toEqual(-1);
  expect(nock.activeMocks()).toHaveLength(1);
});

test('remove', async () => {
  nock('http://localhost:9999/').delete('/mock').reply(200, { status: 'ok' });
  expect(await mockScanner(['remove'])).toEqual(0);
  expect(nock.activeMocks()).toHaveLength(0);
});

test('help', async () => {
  jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  expect(await mockScanner(['help'])).toEqual(0);
  expect(process.stdout.write).toHaveBeenCalled();
});

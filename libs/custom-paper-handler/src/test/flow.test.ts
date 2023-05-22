import { sleep } from '@votingworks/basics';
import waitForExpect from 'wait-for-expect';
import makeDebug from 'debug';
import { ballotFixture } from './fixtures';
import { getPaperHandlerMachine } from '../paper_handler_machine';

const debug = makeDebug('paper-handler:test');

jest.setTimeout(15_000);

test('basic machine flow', async () => {
  const paperHandlerMachine = await getPaperHandlerMachine();
  if (!paperHandlerMachine) {
    return;
  }

  let status = await paperHandlerMachine.getSimpleStatus();

  debug('logging status at beginning of test');
  await paperHandlerMachine.logStatus();
  // test designed to start with no paper inside the scanner,
  debug('ejecting any parked paper');
  await paperHandlerMachine.ejectPaper();
  debug('eject complete');

  status = await paperHandlerMachine.getSimpleStatus();
  expect(['no_paper', 'paper_ready_to_load']).toContain(status);

  // give person running change 10 seconds to load paper, although you could just start with paper in place
  await waitForExpect(
    async () => {
      debug('polling for paper');
      expect(await paperHandlerMachine.getSimpleStatus()).toEqual(
        'paper_ready_to_load'
      );
    },
    10_000,
    200
  );

  // park paper
  const parkPromise = paperHandlerMachine.parkPaper();
  status = await paperHandlerMachine.getSimpleStatus();
  if (status === 'paper_parked') {
    debug('paper already parked');
  } else if (status === 'parking_paper') {
    await parkPromise;
    await waitForExpect(
      async () => {
        expect(await paperHandlerMachine.getSimpleStatus()).toEqual(
          'paper_parked'
        );
      },
      10_000,
      200
    );
  } else {
    throw new Error(`Unexpected status ${status}`);
  }

  // print ballot
  const printBallotPromise = paperHandlerMachine.printBallot(ballotFixture);
  expect(await paperHandlerMachine.getSimpleStatus()).toEqual(
    'printing_ballot'
  );
  await printBallotPromise;
  await waitForExpect(
    async () => {
      status = await paperHandlerMachine.getSimpleStatus();
      expect(status).toEqual('ballot_printed');
    },
    10_000,
    200
  );

  // allow printed ballot to be viewed for demo purposes
  await sleep(10_000);

  // eject ballot out front for now
  const ejectPromise = paperHandlerMachine.ejectPaper();
  expect(await paperHandlerMachine.getSimpleStatus()).toEqual('ejecting');
  await ejectPromise;
  await waitForExpect(
    async () => {
      expect(await paperHandlerMachine.getSimpleStatus()).toEqual('no_paper');
    },
    10_000,
    200
  );
});

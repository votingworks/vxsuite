import { Buffer } from 'buffer';
import { MockPaperHandlerDriver } from './driver';
import { printPdf } from './printing';
import { ballotFixture } from './test/fixtures';

test('printPdf', async () => {
  const driver = new MockPaperHandlerDriver();
  await printPdf(driver, Buffer.from(ballotFixture));
});

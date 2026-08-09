import { Optional } from '@votingworks/basics';
import { PaperHandlerDriverInterface } from './driver_interface.js';
import { PaperHandlerDriver, getPaperHandlerWebDevice } from './driver.js';
import { MaxPrintWidthDots } from './constants.js';

interface GetPaperHandlerDriverProps {
  maxPrintWidth: MaxPrintWidthDots;
}

export async function getPaperHandlerDriver(
  { maxPrintWidth }: GetPaperHandlerDriverProps = {
    maxPrintWidth: MaxPrintWidthDots.BMD_155,
  }
): Promise<Optional<PaperHandlerDriverInterface>> {
  const paperHandlerWebDevice = await getPaperHandlerWebDevice();
  if (!paperHandlerWebDevice) {
    return;
  }

  const paperHandlerDriver = new PaperHandlerDriver(
    paperHandlerWebDevice,
    maxPrintWidth
  );
  await paperHandlerDriver.connect();

  return paperHandlerDriver;
}

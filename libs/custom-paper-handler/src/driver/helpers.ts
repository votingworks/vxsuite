import { Optional } from '@votingworks/basics';
import { PaperHandlerDriverInterface } from './driver_interface';
import { PaperHandlerDriver, getPaperHandlerWebDevice } from './driver';

export async function getPaperHandlerDriver(): Promise<
  Optional<PaperHandlerDriverInterface>
> {
  const paperHandlerWebDevice = await getPaperHandlerWebDevice();
  if (!paperHandlerWebDevice) {
    return;
  }

  const paperHandlerDriver = new PaperHandlerDriver(paperHandlerWebDevice);
  await paperHandlerDriver.connect();
  return paperHandlerDriver;
}

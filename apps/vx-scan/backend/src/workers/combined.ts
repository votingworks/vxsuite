import { throwIllegalValue } from '@votingworks/utils';
import * as interpretNhWorker from './interpret_nh';
import * as interpretVxWorker from './interpret_vx';
import * as qrcodeWorker from './qrcode';

export const workerPath = __filename;

export type Input =
  | interpretNhWorker.Input
  | interpretVxWorker.Input
  | qrcodeWorker.Input;
export type Output =
  | interpretNhWorker.Output
  | interpretVxWorker.Output
  | qrcodeWorker.Output;

export async function call(input: Input): Promise<Output> {
  if (input.action === 'configure') {
    await Promise.all([
      interpretVxWorker.call(input),
      interpretNhWorker.call(input),
    ]);
    return;
  }

  if (input.action === 'interpret') {
    if (input.interpreter === 'nh') {
      return interpretNhWorker.call(input);
    }

    if (input.interpreter === 'vx') {
      return interpretVxWorker.call(input);
    }

    /* istanbul ignore next - compile-time completeness check */
    throwIllegalValue(input, 'interpreter');
  }

  if (input.action === 'detect-qrcode') {
    return qrcodeWorker.call(input);
  }

  /* istanbul ignore next - compile-time completeness check */
  throwIllegalValue(input, 'action');
}

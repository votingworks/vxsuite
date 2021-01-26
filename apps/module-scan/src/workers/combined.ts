import * as interpretWorker from './interpret'
import * as qrcodeWorker from './qrcode'

export const workerPath = __filename

export type Input = interpretWorker.Input | qrcodeWorker.Input
export type Output = interpretWorker.Output | qrcodeWorker.Output

export async function call(input: Input): Promise<Output> {
  switch (input.action) {
    case 'configure':
    case 'interpret':
      return interpretWorker.call(input)

    case 'detect-qrcode':
      return qrcodeWorker.call(input)
  }
}

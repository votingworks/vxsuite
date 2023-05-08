import { throwIllegalValue } from '@votingworks/basics';
import { ConverterClientType } from '@votingworks/types';
import { MsSemsConverterClient } from './ms_sems_converter_client';
import { ConverterClient } from './types';

export * from './types';
export { MsSemsConverterClient };

export function getElectionDefinitionConverterClient(
  converter?: ConverterClientType
): ConverterClient | undefined {
  switch (converter) {
    case undefined:
      return undefined;

    case 'ms-sems':
      return new MsSemsConverterClient('election');

    /* istanbul ignore next */
    default:
      throwIllegalValue(converter);
  }
}

export function getTallyConverterClient(
  converter?: ConverterClientType
): ConverterClient | undefined {
  switch (converter) {
    case undefined:
      return undefined;

    case 'ms-sems':
      return new MsSemsConverterClient('tallies');

    /* istanbul ignore next */
    default:
      throwIllegalValue(converter);
  }
}

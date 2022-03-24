import { throwIllegalValue } from '@votingworks/utils';
import { ConverterClientType } from '../../config/types';
import { MsSemsConverterClient } from './ms_sems_converter_client';
import { NhConverterClient } from './nh_converter_client';
import { ConverterClient } from './types';

export * from './types';
export { MsSemsConverterClient };
export { NhConverterClient };

export function getElectionDefinitionConverterClient(
  converter?: ConverterClientType
): ConverterClient | undefined {
  switch (converter) {
    case undefined:
      return undefined;

    case 'ms-sems':
      return new MsSemsConverterClient('election');

    case 'nh-accuvote':
      return new NhConverterClient();

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

    case 'nh-accuvote':
      return undefined;

    /* istanbul ignore next */
    default:
      throwIllegalValue(converter);
  }
}

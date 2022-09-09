import { unsafeParse } from '@votingworks/types';
import { ConverterClientType, ConverterClientTypeSchema } from './types';

/**
 * Determines which converter client to use, if any.
 */
export function getConverterClientType(): ConverterClientType | undefined {
  const rawConverterClientType = process.env.REACT_APP_VX_CONVERTER;

  if (!rawConverterClientType) {
    return;
  }

  return unsafeParse(ConverterClientTypeSchema, rawConverterClientType);
}

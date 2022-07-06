import { fromByteArray, toByteArray } from 'base64-js';
import fetchMock, { MockRequest } from 'fetch-mock';
import { z } from 'zod';
import { WebServiceCard } from '.';
import { CardSummaryReady, typedAs } from '../types';

const AbSchema = z.object({ a: z.number(), b: z.number() });

it('fetches card status and short value from /card/read', async () => {
  fetchMock.get(
    '/card/read',
    typedAs<CardSummaryReady>({
      status: 'ready',
      shortValue: 'abc',
      longValueExists: true,
    })
  );

  expect(await new WebServiceCard().readSummary()).toEqual(
    typedAs<CardSummaryReady>({
      status: 'ready',
      shortValue: 'abc',
      longValueExists: true,
    })
  );
});

it('reads objects from /card/read_long', async () => {
  fetchMock.get('/card/read_long', {
    longValue: JSON.stringify({ a: 1, b: 2 }),
  });

  expect((await new WebServiceCard().readLongObject(AbSchema)).ok()).toEqual({
    a: 1,
    b: 2,
  });
});

it('reads string data from /card/read_long', async () => {
  const jsonString = JSON.stringify({ a: 1, b: 2 });
  fetchMock.get('/card/read_long', {
    longValue: jsonString,
  });

  expect(await new WebServiceCard().readLongString()).toEqual(jsonString);
});

it('reads binary data from /card/read_long_b64', async () => {
  fetchMock.get('/card/read_long_b64', {
    longValue: fromByteArray(Uint8Array.of(1, 2, 3)),
  });

  expect(await new WebServiceCard().readLongUint8Array()).toEqual(
    Uint8Array.of(1, 2, 3)
  );
});

it('writes short value using /card/write', async () => {
  fetchMock.post('/card/write', (url: string, mockRequest: MockRequest) => {
    expect(url).toBe('/card/write');
    expect(mockRequest.body).toEqual('abc');
    return { success: true };
  });

  await new WebServiceCard().writeShortValue('abc');
});

it('writes objects using /card/write_long_b64', async () => {
  fetchMock.post(
    '/card/write_long_b64',
    (url: string, mockRequest: MockRequest) => {
      expect(url).toBe('/card/write_long_b64');
      const longValue = (mockRequest.body as FormData).get(
        'long_value'
      ) as string;
      const longObject = JSON.parse(
        new TextDecoder().decode(toByteArray(longValue))
      );

      expect(longObject).toEqual({ a: 1 });
      return { success: true };
    }
  );

  await new WebServiceCard().writeLongObject({ a: 1 });
});

it('writes binary data using /card/write_long_b64', async () => {
  fetchMock.post(
    '/card/write_long_b64',
    (url: string, mockRequest: MockRequest) => {
      expect(url).toBe('/card/write_long_b64');
      const longValue = (mockRequest.body as FormData).get(
        'long_value'
      ) as string;
      const longObject = toByteArray(longValue);

      expect(longObject).toEqual(Uint8Array.of(1, 2, 3));
      return { success: true };
    }
  );

  await new WebServiceCard().writeLongUint8Array(Uint8Array.of(1, 2, 3));
});

it('gets undefined when reading object value if long value is not set', async () => {
  fetchMock.get('/card/read_long', {});

  expect(
    (await new WebServiceCard().readLongObject(AbSchema)).ok()
  ).toBeUndefined();
});

it('gets undefined when reading string value if long value is not set', async () => {
  fetchMock.get('/card/read_long', {});

  expect(await new WebServiceCard().readLongString()).toBeUndefined();
});

it('gets undefined when reading binary value if long value is not set', async () => {
  fetchMock.get('/card/read_long_b64', {});

  expect(await new WebServiceCard().readLongUint8Array()).toBeUndefined();
});

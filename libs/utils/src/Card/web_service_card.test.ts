import { CardSummaryReady } from '@votingworks/types';
import { fromByteArray, toByteArray } from 'base64-js';
import fetchMock, { MockRequest } from 'fetch-mock';
import { z } from 'zod';
import { typedAs } from '@votingworks/basics';
import { WebServiceCard } from '.';

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
    expect(url).toEqual('/card/write');
    expect(mockRequest.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(mockRequest.body).toEqual('abc');
    return { success: true };
  });

  await new WebServiceCard().writeShortValue('abc');
});

it('handles failures to write short value using /card/write', async () => {
  fetchMock.post('/card/write', { success: false });

  await expect(new WebServiceCard().writeShortValue('abc')).rejects.toThrow(
    'Failed to write short value'
  );
});

it('writes objects using /card/write_long_b64', async () => {
  fetchMock.post(
    '/card/write_long_b64',
    (url: string, mockRequest: MockRequest) => {
      expect(url).toEqual('/card/write_long_b64');
      expect(mockRequest.headers).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      });
      const body = mockRequest.body as string;
      const longValue = decodeURIComponent(body.replace('long_value=', ''));
      const longObject = JSON.parse(
        new TextDecoder().decode(toByteArray(longValue))
      );
      expect(longObject).toEqual({ a: 1 });
      return { success: true };
    }
  );

  await new WebServiceCard().writeLongObject({ a: 1 });
});

it('handles failures to write objects using /card/write_long_b64', async () => {
  fetchMock.post('/card/write_long_b64', { success: false });

  await expect(new WebServiceCard().writeLongObject({ a: 1 })).rejects.toThrow(
    'Failed to write long value'
  );
});

it('writes binary data using /card/write_long_b64', async () => {
  fetchMock.post(
    '/card/write_long_b64',
    (url: string, mockRequest: MockRequest) => {
      expect(url).toEqual('/card/write_long_b64');
      expect(mockRequest.headers).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      });
      const body = mockRequest.body as string;
      const longValue = decodeURIComponent(body.replace('long_value=', ''));
      const longObject = toByteArray(longValue);
      expect(longObject).toEqual(Uint8Array.of(1, 2, 3));
      return { success: true };
    }
  );

  await new WebServiceCard().writeLongUint8Array(Uint8Array.of(1, 2, 3));
});

it('handles failures to write binary data using /card/write_long_b64', async () => {
  fetchMock.post('/card/write_long_b64', { success: false });

  await expect(
    new WebServiceCard().writeLongUint8Array(Uint8Array.of(1, 2, 3))
  ).rejects.toThrow('Failed to write long value');
});

it('writes short and long values using /card/write_short_and_long', async () => {
  fetchMock.post(
    '/card/write_short_and_long',
    (url: string, mockRequest: MockRequest) => {
      expect(url).toEqual('/card/write_short_and_long');
      expect(mockRequest.headers).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      });
      const body = mockRequest.body as string;
      const values = body.split('&');
      expect(values.length).toEqual(2);
      expect(
        values[0]?.startsWith('short_value=') &&
          values[1]?.startsWith('long_value=')
      ).toEqual(true);
      const shortValue = decodeURIComponent(
        values[0]!.replace('short_value=', '')
      );
      const longValue = decodeURIComponent(
        values[1]!.replace('long_value=', '')
      );
      expect(shortValue).toEqual('abc');
      expect(longValue).toEqual('def');
      return { success: true };
    }
  );

  await new WebServiceCard().writeShortAndLongValues({
    shortValue: 'abc',
    longValue: 'def',
  });
});

it('handles failures to write short and long values using /card/write_short_and_long', async () => {
  fetchMock.post('/card/write_short_and_long', { success: false });

  await expect(
    new WebServiceCard().writeShortAndLongValues({
      shortValue: 'abc',
      longValue: 'def',
    })
  ).rejects.toThrow('Failed to write short and long values');
});

it('overrides write protection using /card/write_protect_override', async () => {
  fetchMock.post(
    '/card/write_protect_override',
    (url: string, mockRequest: MockRequest) => {
      expect(url).toEqual('/card/write_protect_override');
      expect(mockRequest.headers).toEqual({
        Accept: 'application/json',
      });
      return { success: true };
    }
  );

  await new WebServiceCard().overrideWriteProtection();
});

it('handles failures to override write protection using /card/write_protect_override', async () => {
  fetchMock.post('/card/write_protect_override', { success: false });

  await expect(new WebServiceCard().overrideWriteProtection()).rejects.toThrow(
    'Failed to override write protection'
  );
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

it('uses the specified base URL if provided', async () => {
  fetchMock.get(
    'http://localhost:1234/card/read',
    typedAs<CardSummaryReady>({
      status: 'ready',
      shortValue: 'abc',
      longValueExists: true,
    })
  );

  expect(
    await new WebServiceCard({ baseUrl: 'http://localhost:1234' }).readSummary()
  ).toEqual(
    typedAs<CardSummaryReady>({
      status: 'ready',
      shortValue: 'abc',
      longValueExists: true,
    })
  );
});

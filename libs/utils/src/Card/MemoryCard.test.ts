import { z } from 'zod';
import MemoryCard from './MemoryCard';

const ABSchema = z.object({ a: z.number(), b: z.number() });

it('defaults to no card', async () => {
  expect(await new MemoryCard().readStatus()).toEqual({
    present: false,
  });
});

it('can round-trip a short value', async () => {
  const card = new MemoryCard().insertCard();

  await card.writeShortValue('abc');
  expect(await card.readStatus()).toEqual(
    expect.objectContaining({
      shortValue: 'abc',
    })
  );
});

it('can round-trip an object long value', async () => {
  const card = new MemoryCard().insertCard();

  await card.writeLongObject({ a: 1, b: 2 });
  expect((await card.readLongObject(ABSchema)).ok()).toEqual({ a: 1, b: 2 });
});

it('can read a string long value', async () => {
  const card = new MemoryCard().insertCard();

  await card.writeLongObject({ a: 1 });
  expect(await card.readLongString()).toEqual(JSON.stringify({ a: 1 }));
});

it('can round-trip a binary long value', async () => {
  const card = new MemoryCard().insertCard();

  await card.writeLongUint8Array(Uint8Array.of(1, 2, 3));
  expect(await card.readLongUint8Array()).toEqual(Uint8Array.of(1, 2, 3));
});

it('can set a short and long value using #insertCard', async () => {
  const card = new MemoryCard().insertCard('abc', Uint8Array.of(1, 2, 3));

  expect(await card.readStatus()).toEqual({
    present: true,
    shortValue: 'abc',
    longValueExists: true,
  });

  expect(await card.readLongUint8Array()).toEqual(Uint8Array.of(1, 2, 3));

  card.insertCard(undefined, JSON.stringify({ a: 1, b: 2 }));

  expect(await card.readStatus()).toEqual(
    expect.objectContaining({
      shortValue: undefined,
    })
  );

  expect((await card.readLongObject(ABSchema)).ok()).toEqual({ a: 1, b: 2 });
});

it('can remove a card using #removeCard', async () => {
  const card = new MemoryCard()
    .insertCard('abc', Uint8Array.of(1, 2, 3))
    .removeCard();

  expect(await card.readStatus()).toEqual({
    present: false,
  });
});

it('fails to write a short value when there is no card', async () => {
  await expect(new MemoryCard().writeShortValue('abc')).rejects.toThrow(
    'cannot write short value when no card is present'
  );
});

it('fails to write a long value when there is no card', async () => {
  await expect(new MemoryCard().writeLongObject({})).rejects.toThrow(
    'cannot write long value when no card is present'
  );
});

it('gets undefined when reading an object when no long value is set', async () => {
  expect(
    (await new MemoryCard().insertCard().readLongObject(ABSchema)).ok()
  ).toBeUndefined();
});

it('gets undefined when reading a string when no long value is set', async () => {
  expect(await new MemoryCard().insertCard().readLongString()).toBeUndefined();
});

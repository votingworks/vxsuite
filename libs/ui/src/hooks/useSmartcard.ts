import {
  AnyCardData,
  AnyCardDataSchema,
  err,
  ok,
  Optional,
  Result,
  safeParseJSON,
} from '@votingworks/types';
import { Card, Hardware, isCardReader } from '@votingworks/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { map } from 'rxjs/operators';
import useInterval from 'use-interval';
import { useCancelablePromise } from './useCancelablePromise';

export const CARD_POLLING_INTERVAL = 100;

export interface UseSmartcardProps {
  card: Card;
  hardware: Hardware;
}

export interface Smartcard {
  data?: AnyCardData;
  longValueExists?: boolean;
  readLongUint8Array(): Promise<Result<Optional<Uint8Array>, Error>>;
  readLongString(): Promise<Result<Optional<string>, Error>>;
  writeShortValue(value: string): Promise<Result<void, Error>>;
  writeLongValue(value: unknown | Uint8Array): Promise<Result<void, Error>>;
}

export type UseSmartcardResult = [
  smartcard: Smartcard | undefined,
  hasCardReader: boolean
];

interface State {
  readonly lastCardDataString?: string;
  readonly longValueExists?: boolean;
  readonly isCardPresent: boolean;
  readonly cardData?: AnyCardData;
  readonly hasCardReaderAttached: boolean;
}

const initialState: State = {
  isCardPresent: false,
  hasCardReaderAttached: false,
};

/**
 * React hook for getting the current smartcard data.
 *
 * @example
 *
 * const [smartcard, hasCardReader] = useSmartcard({ card, hardware })
 * useEffect(() => {
 *    if (!hasCardReader) {
 *      console.log('No card reader')
 *    } else if (smartcard.data) {
 *      console.log(
 *        'Got a smartcard of type:',
 *        smartcard.data.t,
 *        'Has long value?',
 *        smartcard.longValueExists
 *      )
 *    } else {
 *      console.log('No smartcard')
 *    }
 * }, [smartcard, hasCardReader])
 */
export function useSmartcard({
  card,
  hardware,
}: UseSmartcardProps): UseSmartcardResult {
  const [
    {
      cardData,
      hasCardReaderAttached,
      isCardPresent,
      lastCardDataString,
      longValueExists,
    },
    setState,
  ] = useState(initialState);
  const isReading = useRef(false);
  const isWriting = useRef(false);
  const makeCancelable = useCancelablePromise();

  const set = useCallback(
    (updates: Partial<State>) => setState((prev) => ({ ...prev, ...updates })),
    []
  );

  const readLongUint8Array = useCallback(async (): Promise<
    Result<Optional<Uint8Array>, Error>
  > => {
    try {
      return ok(await makeCancelable(card.readLongUint8Array()));
    } catch (error) {
      return err(error);
    }
  }, [card, makeCancelable]);

  const readLongString = useCallback(async (): Promise<
    Result<Optional<string>, Error>
  > => {
    try {
      return ok(await makeCancelable(card.readLongString()));
    } catch (error) {
      return err(error);
    }
  }, [card, makeCancelable]);

  const writeShortValue = useCallback(
    async (value: string): Promise<Result<void, Error>> => {
      if (isWriting.current) {
        return err(new Error('already writing'));
      }
      isWriting.current = true;
      try {
        await makeCancelable(card.writeShortValue(value));
        return ok();
      } catch (error) {
        return err(error);
      } finally {
        isWriting.current = false;
      }
    },
    [makeCancelable, card]
  );

  const writeLongValue = useCallback(
    async (value: unknown | Uint8Array): Promise<Result<void, Error>> => {
      if (isWriting.current) {
        return err(new Error('already writing'));
      }
      isWriting.current = true;
      try {
        if (value instanceof Uint8Array) {
          await makeCancelable(card.writeLongUint8Array(value));
        } else {
          await makeCancelable(card.writeLongObject(value));
        }
        return ok();
      } catch (error) {
        return err(error);
      } finally {
        isWriting.current = false;
      }
    },
    [makeCancelable, card]
  );

  useEffect(() => {
    const hardwareStatusSubscription = hardware.devices
      .pipe(map((devices) => Array.from(devices)))
      .subscribe(async (devices) => {
        set({ hasCardReaderAttached: devices.some(isCardReader) });
      });
    return () => {
      hardwareStatusSubscription.unsubscribe();
    };
  }, [hardware, set]);

  useInterval(
    async () => {
      if (isReading.current || isWriting.current || !hasCardReaderAttached) {
        return;
      }

      isReading.current = true;
      try {
        const insertedCard = await makeCancelable(card.readStatus());

        // we compare last card and current card without the longValuePresent flag
        // otherwise when we first write the ballot to the card, it reprocesses it
        // and may cause a race condition where an old ballot on the card
        // overwrites a newer one in memory.
        //
        // TODO: embed a card dip UUID in the card data string so even an unlikely
        // identical card swap within 200ms is always detected.
        // https://github.com/votingworks/module-smartcards/issues/59
        const cardCopy = {
          ...insertedCard,
          longValueExists: undefined, // override longValueExists (see above comment)
        };
        const currentCardDataString = JSON.stringify(cardCopy);
        if (currentCardDataString === lastCardDataString) {
          return;
        }

        set({
          isCardPresent: insertedCard.present,
          longValueExists: insertedCard.present && insertedCard.longValueExists,
          cardData:
            insertedCard.present && insertedCard.shortValue
              ? safeParseJSON(insertedCard.shortValue, AnyCardDataSchema).ok()
              : undefined,
          lastCardDataString: currentCardDataString,
        });
      } finally {
        isReading.current = false;
      }
    },
    CARD_POLLING_INTERVAL,
    true
  );

  const result = useMemo<UseSmartcardResult>(
    () => [
      isCardPresent
        ? {
            data: cardData,
            longValueExists,
            readLongUint8Array,
            readLongString,
            writeShortValue,
            writeLongValue,
          }
        : undefined,
      hasCardReaderAttached,
    ],
    [
      isCardPresent,
      cardData,
      longValueExists,
      readLongUint8Array,
      readLongString,
      writeShortValue,
      writeLongValue,
      hasCardReaderAttached,
    ]
  );

  return result;
}

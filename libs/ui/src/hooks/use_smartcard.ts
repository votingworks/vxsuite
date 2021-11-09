import {
  AnyCardData,
  AnyCardDataSchema,
  err,
  ok,
  Optional,
  Result,
  safeParseJSON,
} from '@votingworks/types';
import { Card } from '@votingworks/utils';
import { useCallback, useMemo, useRef, useState } from 'react';
import useInterval from 'use-interval';
import { useCancelablePromise } from './use_cancelable_promise';

export const CARD_POLLING_INTERVAL = 100;

export interface UseSmartcardProps {
  card: Card;
  hasCardReaderAttached: boolean;
}

export interface Smartcard {
  data?: AnyCardData;
  longValueExists?: boolean;
  readLongUint8Array(): Promise<Result<Optional<Uint8Array>, Error>>;
  readLongString(): Promise<Result<Optional<string>, Error>>;
  writeShortValue(value: string): Promise<Result<void, Error>>;
  writeLongValue(value: unknown | Uint8Array): Promise<Result<void, Error>>;
}

interface State {
  readonly lastCardDataString?: string;
  readonly longValueExists?: boolean;
  readonly isCardPresent: boolean;
  readonly cardData?: AnyCardData;
}

const initialState: State = {
  isCardPresent: false,
};

/**
 * React hook for getting the current smartcard data.
 *
 * @example
 *
 * const { hasCardReaderAttached } = useSmartcard({ hardware, logger })
 * const smartcard = useSmartcard({ card, hasCardReaderAttached })
 * useEffect(() => {
 *    if (!hasCardReaderAttached) {
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
 * }, [smartcard, hasCardReaderAttached])
 */
export function useSmartcard({
  card,
  hasCardReaderAttached,
}: UseSmartcardProps): Optional<Smartcard> {
  const [
    { cardData, isCardPresent, lastCardDataString, longValueExists },
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

  const result = useMemo<Optional<Smartcard>>(
    () =>
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
    [
      isCardPresent,
      cardData,
      longValueExists,
      readLongUint8Array,
      readLongString,
      writeShortValue,
      writeLongValue,
    ]
  );

  return result;
}

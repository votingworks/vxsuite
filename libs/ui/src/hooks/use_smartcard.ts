import {
  AnyCardData,
  AnyCardDataSchema,
  err,
  ok,
  Optional,
  Result,
  safeParseJson,
} from '@votingworks/types';
import { Card, CardApi, CardApiNotReady } from '@votingworks/utils';
import { useCallback, useMemo, useRef, useState } from 'react';
import useInterval from 'use-interval';
import { useCancelablePromise } from './use_cancelable_promise';

export const CARD_POLLING_INTERVAL = 100;

export interface UseSmartcardProps {
  card: Card;
  hasCardReaderAttached: boolean;
}

interface SmartcardReady {
  status: 'ready';
  data?: AnyCardData;
  longValueExists?: boolean;
  readLongUint8Array(): Promise<Result<Optional<Uint8Array>, Error>>;
  readLongString(): Promise<Result<Optional<string>, Error>>;
  writeShortValue(value: string): Promise<Result<void, Error>>;
  writeLongValue(value: unknown | Uint8Array): Promise<Result<void, Error>>;
}

interface SmartcardNotReady extends CardApiNotReady {
  // We make data present even if the card is not ready for easy
  // nullish-coalescing by consumers.
  data?: undefined;
}

export type Smartcard = SmartcardReady | SmartcardNotReady;

interface State {
  readonly lastCardDataString?: string;
  readonly longValueExists?: boolean;
  readonly status: CardApi['status'];
  readonly cardData?: AnyCardData;
}

const initialState: State = {
  status: 'no_card',
};

/**
 * React hook for getting the current smartcard data.
 *
 * @example
 *
 * const { hasCardReaderAttached } = useHardware({ hardware, logger })
 * const smartcard = useSmartcard({ card, hasCardReaderAttached })
 * useEffect(() => {
 *    if (!hasCardReaderAttached) {
 *      console.log('No card reader')
 *    } else if (smartcard.status === 'ready' && smartcard.data) {
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
}: UseSmartcardProps): Smartcard {
  const [
    { cardData, status, lastCardDataString, longValueExists },
    setState,
  ] = useState(initialState);
  const isReading = useRef(false);
  const isWriting = useRef(false);
  const makeCancelable = useCancelablePromise();

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
        const currentCardDataString = JSON.stringify({
          ...insertedCard,
          longValueExists: undefined, // override longValueExists (see above comment)
        });
        if (currentCardDataString === lastCardDataString) {
          return;
        }

        setState({
          status: insertedCard.status,
          cardData:
            insertedCard.status === 'ready' && insertedCard.shortValue
              ? safeParseJson(insertedCard.shortValue, AnyCardDataSchema).ok()
              : undefined,
          longValueExists:
            insertedCard.status === 'ready' && insertedCard.longValueExists,
          lastCardDataString: currentCardDataString,
        });
      } finally {
        isReading.current = false;
      }
    },
    CARD_POLLING_INTERVAL,
    true
  );

  const result = useMemo<Smartcard>(
    () =>
      status === 'ready'
        ? {
            status,
            data: cardData,
            longValueExists,
            readLongUint8Array,
            readLongString,
            writeShortValue,
            writeLongValue,
          }
        : { status },
    [
      status,
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

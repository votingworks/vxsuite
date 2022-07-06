import {
  AnyCardData,
  AnyCardDataSchema,
  err,
  ok,
  Optional,
  Result,
  safeParseJson,
} from '@votingworks/types';
import {
  assert,
  Card,
  CardSummary,
  CardSummaryNotReady,
} from '@votingworks/utils';
import { useCallback, useMemo, useRef, useState } from 'react';
import useInterval from 'use-interval';
import { CARD_POLLING_INTERVAL } from './smartcard_auth';
import { useCancelablePromise } from './use_cancelable_promise';
import { Devices } from './use_devices';

export interface UseSmartcardProps {
  card: Card;
  cardReader?: Devices['cardReader'];
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

interface SmartcardNotReady extends CardSummaryNotReady {
  // We make data present even if the card is not ready for easy
  // nullish-coalescing by consumers.
  data?: undefined;
}

export type Smartcard = SmartcardReady | SmartcardNotReady;

interface State {
  readonly lastCardDataString?: string;
  readonly longValueExists?: boolean;
  readonly status: CardSummary['status'];
  readonly cardData?: AnyCardData;
}

const initialState: State = {
  status: 'no_card',
};

/**
 * TODO(https://github.com/votingworks/vxsuite/issues/2048): Delete this hook after migrating off
 * of it in frontends/bas
 *
 * React hook for getting the current smartcard data.
 *
 * @example
 *
 * const { cardReader } = useDevices({ hardware, logger })
 * const smartcard = useSmartcard({ card, cardReader })
 * useEffect(() => {
 *    if (!cardReader) {
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
 * }, [smartcard, cardReader])
 */
export function useSmartcard({
  card,
  cardReader,
}: UseSmartcardProps): Smartcard {
  const [{ cardData, status, lastCardDataString, longValueExists }, setState] =
    useState(initialState);
  const isReading = useRef(false);
  const isWriting = useRef(false);
  const makeCancelable = useCancelablePromise();

  const readLongUint8Array = useCallback(async (): Promise<
    Result<Optional<Uint8Array>, Error>
  > => {
    try {
      return ok(await makeCancelable(card.readLongUint8Array()));
    } catch (error) {
      assert(error instanceof Error);
      return err(error);
    }
  }, [card, makeCancelable]);

  const readLongString = useCallback(async (): Promise<
    Result<Optional<string>, Error>
  > => {
    try {
      return ok(await makeCancelable(card.readLongString()));
    } catch (error) {
      assert(error instanceof Error);
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
        assert(error instanceof Error);
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
        assert(error instanceof Error);
        return err(error);
      } finally {
        isWriting.current = false;
      }
    },
    [makeCancelable, card]
  );

  useInterval(
    async () => {
      if (isReading.current || isWriting.current || !cardReader) {
        return;
      }

      isReading.current = true;
      try {
        const insertedCard = await makeCancelable(card.readSummary());

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

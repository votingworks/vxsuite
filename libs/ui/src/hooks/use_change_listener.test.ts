import { renderHook } from '@testing-library/react-hooks';
import { mockFunction } from '@votingworks/test-utils';
import { UseQueryResult } from '@tanstack/react-query';
import {
  useExternalStateChangeListener,
  useQueryChangeListener,
} from './use_change_listener';

describe('useExternalStateChangeListener', () => {
  test('calls the changeHandler function when the state changes', () => {
    const changeHandler =
      mockFunction<(newState: string, previousState?: string) => void>(
        'changeHandler'
      );

    changeHandler.expectCallWith('state 1', undefined).returns();
    const { rerender } = renderHook(
      (state) => useExternalStateChangeListener(state, changeHandler),
      { initialProps: 'state 1' }
    );

    changeHandler.expectCallWith('state 2', 'state 1').returns();
    rerender('state 2');

    // When state doesn't change, the changeHandler is not called
    rerender('state 2');

    changeHandler.expectCallWith('state 3', 'state 2').returns();
    rerender('state 3');

    changeHandler.assertComplete();
  });

  test('works with objects using value equality', () => {
    const changeHandler =
      mockFunction<
        (newState: { a: number }, previousState?: { a: number }) => void
      >('changeHandler');

    changeHandler.expectCallWith({ a: 1 }, undefined).returns();
    const { rerender } = renderHook(
      (state) => useExternalStateChangeListener(state, changeHandler),
      { initialProps: { a: 1 } }
    );

    changeHandler.expectCallWith({ a: 2 }, { a: 1 }).returns();
    rerender({ a: 2 });

    // When object values don't change, even if object identity changes, the changeHandler is not called
    rerender({ a: 2 });

    changeHandler.expectCallWith({ a: 3 }, { a: 2 }).returns();
    rerender({ a: 3 });

    changeHandler.assertComplete();
  });

  test('works with async changeHandler', () => {
    const changeHandler =
      mockFunction<(newState: string, previousState?: string) => Promise<void>>(
        'changeHandler'
      );

    changeHandler.expectCallWith('state 1', undefined).resolves();
    const { rerender } = renderHook(
      (state) => useExternalStateChangeListener(state, changeHandler),
      { initialProps: 'state 1' }
    );

    changeHandler.expectCallWith('state 2', 'state 1').resolves();
    rerender('state 2');

    changeHandler.assertComplete();
  });
});

describe('useQueryChangeListener', () => {
  test('calls the changeHandler function when the query data changes', () => {
    const changeHandler =
      mockFunction<(newData: string, previousData?: string) => void>(
        'changeHandler'
      );

    changeHandler.expectCallWith('data 1', undefined).returns();
    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: true,
          data,
        } as unknown as UseQueryResult<string>;
        return useQueryChangeListener(mockQuery, changeHandler);
      },
      { initialProps: 'data 1' }
    );

    changeHandler.expectCallWith('data 2', 'data 1').returns();
    rerender('data 2');

    // When data doesn't change, the changeHandler is not called
    rerender('data 2');

    changeHandler.expectCallWith('data 3', 'data 2').returns();
    rerender('data 3');

    changeHandler.assertComplete();
  });

  test('works with objects using value equality', () => {
    const changeHandler =
      mockFunction<
        (newData: { a: number }, previousData?: { a: number }) => void
      >('changeHandler');

    changeHandler.expectCallWith({ a: 1 }, undefined).returns();
    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: true,
          data,
        } as unknown as UseQueryResult<{ a: number }>;
        return useQueryChangeListener(mockQuery, changeHandler);
      },
      { initialProps: { a: 1 } }
    );

    changeHandler.expectCallWith({ a: 2 }, { a: 1 }).returns();
    rerender({ a: 2 });

    // When object values don't change, even if object identity changes, the changeHandler is not called
    rerender({ a: 2 });

    changeHandler.expectCallWith({ a: 3 }, { a: 2 }).returns();
    rerender({ a: 3 });

    changeHandler.assertComplete();
  });

  test('works with async changeHandler', () => {
    const changeHandler =
      mockFunction<(newData: string, previousData?: string) => Promise<void>>(
        'changeHandler'
      );

    changeHandler.expectCallWith('data 1', undefined).resolves();
    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: true,
          data,
        } as unknown as UseQueryResult<string>;
        return useQueryChangeListener(mockQuery, changeHandler);
      },
      { initialProps: 'data 1' }
    );

    changeHandler.expectCallWith('data 2', 'data 1').resolves();
    rerender('data 2');

    changeHandler.assertComplete();
  });

  test("doesn't call the changeHandler function when the query is not successful", () => {
    const changeHandler =
      mockFunction<(newData: string, previousData?: string) => void>(
        'changeHandler'
      );

    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: false,
          data,
        } as unknown as UseQueryResult<string>;
        return useQueryChangeListener(mockQuery, changeHandler);
      },
      { initialProps: undefined }
    );

    rerender();

    changeHandler.assertComplete();
  });
});

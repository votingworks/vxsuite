import { mockFunction } from '@votingworks/test-utils';
import { UseQueryResult } from '@tanstack/react-query';
import {
  useExternalStateChangeListener,
  useQueryChangeListener,
} from './use_change_listener';
import { renderHook } from '../../test/react_testing_library';

describe('useExternalStateChangeListener', () => {
  test('calls the onChange function when the state changes', () => {
    const onChange =
      mockFunction<(newState: string, previousState?: string) => void>(
        'onChange'
      );

    onChange.expectCallWith('state 1', undefined).returns();
    const { rerender } = renderHook(
      (state) => useExternalStateChangeListener(state, onChange),
      { initialProps: 'state 1' }
    );

    onChange.expectCallWith('state 2', 'state 1').returns();
    rerender('state 2');

    // When state doesn't change, the onChange is not called
    rerender('state 2');

    onChange.expectCallWith('state 3', 'state 2').returns();
    rerender('state 3');

    onChange.assertComplete();
  });

  test('works with objects using value equality', () => {
    const onChange =
      mockFunction<
        (newState: { a: number }, previousState?: { a: number }) => void
      >('onChange');

    onChange.expectCallWith({ a: 1 }, undefined).returns();
    const { rerender } = renderHook(
      (state) => useExternalStateChangeListener(state, onChange),
      { initialProps: { a: 1 } }
    );

    onChange.expectCallWith({ a: 2 }, { a: 1 }).returns();
    rerender({ a: 2 });

    // When object values don't change, even if object identity changes, the onChange is not called
    rerender({ a: 2 });

    onChange.expectCallWith({ a: 3 }, { a: 2 }).returns();
    rerender({ a: 3 });

    onChange.assertComplete();
  });

  test('works with async onChange', () => {
    const onChange =
      mockFunction<(newState: string, previousState?: string) => Promise<void>>(
        'onChange'
      );

    onChange.expectCallWith('state 1', undefined).resolves();
    const { rerender } = renderHook(
      (state) => useExternalStateChangeListener(state, onChange),
      { initialProps: 'state 1' }
    );

    onChange.expectCallWith('state 2', 'state 1').resolves();
    rerender('state 2');

    onChange.assertComplete();
  });
});

describe('useQueryChangeListener', () => {
  test('calls the onChange function when the query data changes', () => {
    const onChange =
      mockFunction<(newData: string, previousData?: string) => void>(
        'onChange'
      );

    onChange.expectCallWith('data 1', undefined).returns();
    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: true,
          data,
        } as unknown as UseQueryResult<string>;
        return useQueryChangeListener(mockQuery, { onChange });
      },
      { initialProps: 'data 1' }
    );

    onChange.expectCallWith('data 2', 'data 1').returns();
    rerender('data 2');

    // When data doesn't change, the onChange is not called
    rerender('data 2');

    onChange.expectCallWith('data 3', 'data 2').returns();
    rerender('data 3');

    onChange.assertComplete();
  });

  test('works with objects using value equality', () => {
    const onChange =
      mockFunction<
        (newData: { a: number }, previousData?: { a: number }) => void
      >('onChange');

    onChange.expectCallWith({ a: 1 }, undefined).returns();
    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: true,
          data,
        } as unknown as UseQueryResult<{ a: number }>;
        return useQueryChangeListener(mockQuery, { onChange });
      },
      { initialProps: { a: 1 } }
    );

    onChange.expectCallWith({ a: 2 }, { a: 1 }).returns();
    rerender({ a: 2 });

    // When object values don't change, even if object identity changes, the onChange is not called
    rerender({ a: 2 });

    onChange.expectCallWith({ a: 3 }, { a: 2 }).returns();
    rerender({ a: 3 });

    onChange.assertComplete();
  });

  test('allows selecting a subset of the data', () => {
    const onChange =
      mockFunction<(newData: number, previousData?: number) => void>(
        'onChange'
      );

    onChange.expectCallWith(1, undefined).returns();
    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: true,
          data,
        } as unknown as UseQueryResult<{ a: number; b: number }>;
        return useQueryChangeListener(mockQuery, {
          select: ({ a }) => a,
          onChange,
        });
      },
      { initialProps: { a: 1, b: 2 } }
    );

    onChange.expectCallWith(2, 1).returns();
    rerender({ a: 2, b: 2 });

    // When selected values don't change, even if object identity changes, the onChange is not called
    rerender({ a: 2, b: 2 });

    onChange.expectCallWith(3, 2).returns();
    rerender({ a: 3, b: 2 });

    onChange.assertComplete();

    // When another non-selected value changes, the onChange is not called
    rerender({ a: 3, b: 3 });
  });

  test('works with async onChange', () => {
    const onChange =
      mockFunction<(newData: string, previousData?: string) => Promise<void>>(
        'onChange'
      );

    onChange.expectCallWith('data 1', undefined).resolves();
    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: true,
          data,
        } as unknown as UseQueryResult<string>;
        return useQueryChangeListener(mockQuery, { onChange });
      },
      { initialProps: 'data 1' }
    );

    onChange.expectCallWith('data 2', 'data 1').resolves();
    rerender('data 2');

    onChange.assertComplete();
  });

  test("doesn't call the onChange function when the query is not successful", () => {
    const onChange =
      mockFunction<(newData: string, previousData?: string) => void>(
        'onChange'
      );

    const { rerender } = renderHook(
      (data) => {
        const mockQuery = {
          isSuccess: false,
          data,
        } as unknown as UseQueryResult<string>;
        return useQueryChangeListener(mockQuery, { onChange });
      },
      { initialProps: undefined }
    );

    rerender();

    onChange.assertComplete();
  });
});

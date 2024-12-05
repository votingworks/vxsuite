import {
  advanceTimers,
  advanceTimersAndPromises,
} from '@votingworks/test-utils';
import { sleep } from '@votingworks/basics';
import { act, renderHook, waitFor } from '../../test/react_testing_library';
import { useCancelablePromise } from './use_cancelable_promise';

beforeEach(() => {
  jest.useFakeTimers();
});

test('resolves when component is still mounted', async () => {
  const resolve = jest.fn();

  const { result } = renderHook(() => useCancelablePromise());
  const makeCancelable = result.current;

  act(() => {
    void makeCancelable(sleep(10)).then(resolve);
  });

  expect(resolve).not.toHaveBeenCalled();
  await advanceTimersAndPromises(10);
  expect(resolve).toHaveBeenCalled();
});

test('rejects when component is still mounted', async () => {
  const reject = jest.fn();

  const { result } = renderHook(() => useCancelablePromise());
  const makeCancelable = result.current;

  act(() => {
    void makeCancelable(sleep(10).then(() => Promise.reject())).catch(reject);
  });

  expect(reject).not.toHaveBeenCalled();
  await advanceTimers(10);
  await waitFor(() => {
    expect(reject).toHaveBeenCalled();
  });
});

test('does not resolve when component is unmounted', async () => {
  const resolve = jest.fn();

  const { result, unmount } = renderHook(() => useCancelablePromise());
  const makeCancelable = result.current;

  act(() => {
    void makeCancelable(sleep(10)).then(resolve);
  });

  expect(resolve).not.toHaveBeenCalled();
  unmount();
  await advanceTimersAndPromises(10);
  expect(resolve).not.toHaveBeenCalled();
});

test('does not reject when component is unmounted', async () => {
  const reject = jest.fn();

  const { result, unmount } = renderHook(() => useCancelablePromise());
  const makeCancelable = result.current;

  act(() => {
    void makeCancelable(sleep(10).then(() => Promise.reject())).catch(reject);
  });

  expect(reject).not.toHaveBeenCalled();
  unmount();
  await advanceTimersAndPromises(10);
  expect(reject).not.toHaveBeenCalled();
});

test('optionally calls a callback when canceling', async () => {
  const resolve = jest.fn();
  const cancel = jest.fn();

  const { result, unmount } = renderHook(() => useCancelablePromise());
  const makeCancelable = result.current;

  act(() => {
    void makeCancelable(sleep(10), cancel).then(resolve);
  });

  expect(resolve).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  unmount();
  await advanceTimersAndPromises(10);
  expect(resolve).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});

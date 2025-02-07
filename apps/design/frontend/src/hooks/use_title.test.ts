import { renderHook, waitFor } from '@testing-library/react';
import { setBaseTitle, useTitle } from './use_title';

beforeEach(() => {
  setBaseTitle('My Site');
});

test('null case', async () => {
  const { unmount } = renderHook(() => useTitle());
  expect(document.title).toEqual('My Site');
  unmount();
  await waitFor(() => {
    expect(document.title).toEqual('My Site');
  });
});

test('no base title', async () => {
  setBaseTitle('');
  const { unmount } = renderHook(() => useTitle('My Page'));
  expect(document.title).toEqual('My Page');
  unmount();
  await waitFor(() => {
    expect(document.title).toEqual('');
  });
});

test('single title part', async () => {
  const { unmount } = renderHook(() => useTitle('My Page'));
  expect(document.title).toEqual('My Page – My Site');
  unmount();
  await waitFor(() => {
    expect(document.title).toEqual('My Site');
  });
});

test('multiple title parts', async () => {
  const { unmount } = renderHook(() => useTitle('My Page', 'Resource Name'));
  expect(document.title).toEqual('My Page – Resource Name – My Site');
  unmount();
  await waitFor(() => {
    expect(document.title).toEqual('My Site');
  });
});

test('empty title parts', async () => {
  const { unmount } = renderHook(() =>
    useTitle('a', '', 'b', undefined, 'c', null)
  );
  expect(document.title).toEqual('a – b – c – My Site');
  unmount();
  await waitFor(() => {
    expect(document.title).toEqual('My Site');
  });
});

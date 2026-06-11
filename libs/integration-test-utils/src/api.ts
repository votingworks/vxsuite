import type { APIResponse, Page } from '@playwright/test';
import { methodUrl } from '@votingworks/grout';
import { BASE_URL } from './constants';

const API_URL = `${BASE_URL}/api`;

/**
 * Posts to a backend Grout API method, bypassing the UI, and returns the raw
 * response. Used by tests to drive backend state directly (e.g. logging out or
 * reading a mock device's status). The caller decides how to handle failures.
 */
export async function postToApi(
  page: Page,
  method: string,
  input: object = {}
): Promise<APIResponse> {
  return page.request.post(methodUrl(method, API_URL), {
    data: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  });
}

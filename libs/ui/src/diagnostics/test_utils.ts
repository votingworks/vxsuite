import type * as vitest from 'vitest';
import type * as jest from '@jest/globals';
import { within } from '@testing-library/react';
import { assertDefined } from '@votingworks/basics';
import { VxScreen } from '../themes/render_with_themes';
import { DiagnosticSectionTitle } from './types';

function expectTextInSection(
  expect: typeof vitest.expect | typeof jest.expect,
  screen: VxScreen,
  headerText: string,
  expectedText: string | RegExp
) {
  const section = screen.getByText(headerText).closest('section');
  expect(
    within(
      assertDefined(
        section,
        `Couldn't find section with header '${headerText}'`
      )
    ).getByText(expectedText)
  ).toBeDefined();
}

export function expectConnectionStatus(
  expect: typeof vitest.expect | typeof jest.expect,
  screen: VxScreen,
  headerText: DiagnosticSectionTitle,
  connectionStatusText: string
): void {
  expectTextInSection(expect, screen, headerText, connectionStatusText);
}

export function expectDiagnosticResult(
  expect: typeof vitest.expect | typeof jest.expect,
  screen: VxScreen,
  headerText: DiagnosticSectionTitle,
  passed: boolean
): void {
  expectTextInSection(
    expect,
    screen,
    headerText,
    passed ? /Test passed/ : /Test failed/
  );
}

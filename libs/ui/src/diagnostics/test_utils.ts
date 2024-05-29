import { within } from '@testing-library/react';
import { assertDefined } from '@votingworks/basics';
import { VxScreen } from '../themes/render_with_themes';
import { DiagnosticSectionTitle } from './types';

function expectTextInSection(
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

export function expectDetected(
  screen: VxScreen,
  headerText: DiagnosticSectionTitle,
  detectedExpected: boolean
): void {
  expectTextInSection(
    screen,
    headerText,
    detectedExpected ? 'Detected' : 'Not detected'
  );
}

export function expectDiagnosticResult(
  screen: VxScreen,
  headerText: DiagnosticSectionTitle,
  passed: boolean
): void {
  expectTextInSection(
    screen,
    headerText,
    passed ? /Test passed/ : /Test failed/
  );
}

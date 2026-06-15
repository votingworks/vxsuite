/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import type {
  Locator,
  Page,
  PageScreenshotOptions,
  TestInfo,
} from '@playwright/test';
import { SCREENSHOTS_DIR } from './constants';

/**
 * Builds ordered, collision-free filename stems for the screenshots captured
 * within a single test. Filenames are namespaced by test identity, so they are
 * deterministic and independent of Playwright's worker lifecycle: a CI retry
 * regenerates identical filenames and cleanly overwrites the previous attempt,
 * rather than colliding with another test's screenshots (a module-global
 * counter would reset to zero whenever a failed test spawns a fresh worker).
 */
export interface ScreenshotNamer {
  /** Returns the next filename stem (no extension) for the given screenshot. */
  next: (name: string) => string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createScreenshotNamer(testInfo: TestInfo): ScreenshotNamer {
  const slug = slugify(testInfo.title);
  let index = 0;
  return {
    next(name: string): string {
      const prefix = String(index).padStart(3, '0');
      index += 1;
      return `${slug}-${prefix}-${name}`;
    },
  };
}

export function buildIntegrationTestHelper(page: Page, namer: ScreenshotNamer) {
  async function screenshot(name: string, args: PageScreenshotOptions = {}) {
    await page.screenshot({
      animations: 'disabled',
      ...args,
      path: `${SCREENSHOTS_DIR}/${namer.next(name)}.png`,
    });
  }

  async function clickModalButton(buttonText: string | RegExp) {
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: buttonText })
      .click();
  }

  async function addFocusHighlight(buttonText: string | RegExp) {
    // First try to find the button in an alert dialog, fall back to page-level search
    const buttonInDialog = page
      .getByRole('alertdialog')
      .getByRole('button', { name: buttonText })
      .or(
        page.getByRole('alertdialog').getByRole('option', { name: buttonText })
      )
      .or(
        page.getByRole('alertdialog').getByRole('radio', { name: buttonText })
      );

    const button =
      (await buttonInDialog.count()) > 0
        ? buttonInDialog
        : page
            .getByRole('button', { name: buttonText })
            .or(page.getByRole('option', { name: buttonText }))
            .or(page.getByRole('radio', { name: buttonText }));

    await button.evaluate((el) => {
      // Get button's position and size
      const rect = el.getBoundingClientRect();

      // Create an absolutely positioned overlay
      const overlay = document.createElement('div');
      overlay.setAttribute('data-focus-highlight', 'true');
      overlay.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        outline: 10px solid #00E7E7;
        outline-offset: 2px;
        border-radius: 4px;
        pointer-events: none;
        z-index: 9999;
      `;

      document.body.appendChild(overlay);
    });

    await page.waitForTimeout(50);
  }

  async function removeFocusHighlight() {
    await page.evaluate(() => {
      const overlay = document.querySelector('[data-focus-highlight="true"]');
      overlay?.remove();
    });

    await page.waitForTimeout(50);
  }

  async function screenshotWithButtonHighlight(
    buttonText: string | RegExp,
    name: string,
    args: PageScreenshotOptions = {}
  ) {
    await addFocusHighlight(buttonText);
    await screenshot(name, args);
    await removeFocusHighlight();
  }

  async function screenshotWithLocatorHighlight(
    locator: Locator,
    name: string,
    args: PageScreenshotOptions = {}
  ) {
    await locator.evaluate((el: Element) => {
      const rect = el.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.setAttribute('data-focus-highlight', 'true');
      overlay.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        outline: 10px solid #00E7E7;
        outline-offset: 2px;
        border-radius: 4px;
        pointer-events: none;
        z-index: 9999;
      `;
      document.body.appendChild(overlay);
    });

    await page.waitForTimeout(50);
    await screenshot(name, args);
    await removeFocusHighlight();
  }

  async function measureOverflow(selector: string): Promise<number | null> {
    return page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) return null;
      return element.scrollHeight - element.clientHeight;
    }, selector);
  }

  /**
   * Temporarily grows the window so the given scrollable container (e.g.
   * `main`, which has `overflow: auto`) renders all of its content within the
   * viewport, runs the callback (typically a screenshot), then restores the
   * viewport.
   *
   * The container's content height can change after the initial measurement —
   * async queries (disk space, device status, etc.) may not have resolved yet,
   * and growing the viewport can itself reflow content. So rather than
   * measuring once and bailing when there's no overflow, this re-measures after
   * each resize and keeps expanding until the container no longer overflows (or
   * a safety cap is hit). This makes the full-page capture deterministic
   * instead of silently falling back to a clipped viewport screenshot.
   */
  async function withContainerVerticallyExpanded(
    selector: string,
    callback: () => Promise<void>
  ) {
    const width = page.viewportSize()?.width ?? 1280;
    const originalHeight = page.viewportSize()?.height ?? 720;

    let height = originalHeight;
    // Cap the number of grow-and-remeasure passes so a container that never
    // stops overflowing (unexpected) can't loop forever.
    const MAX_PASSES = 5;
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      // Let pending layout/queries settle before measuring, so late-loading
      // content is included in the overflow amount.
      await page.waitForTimeout(150);
      const overflow = await measureOverflow(selector);
      if (overflow === null || overflow <= 0) {
        break;
      }
      height += overflow;
      await page.setViewportSize({ width, height });
    }

    await callback();

    if (height !== originalHeight) {
      await page.setViewportSize({ width, height: originalHeight });
      await page.waitForTimeout(100);
    }
  }

  return {
    screenshot,
    screenshotWithButtonHighlight,
    screenshotWithLocatorHighlight,
    clickModalButton,
    withContainerVerticallyExpanded,
  };
}

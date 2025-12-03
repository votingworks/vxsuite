/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import type { Page, PageScreenshotOptions } from '@playwright/test';

export function buildIntegrationTestHelper(page: Page) {
  async function screenshot(name: string, args: PageScreenshotOptions = {}) {
    await page.screenshot({
      animations: 'disabled',
      ...args,
      path: `./test-results/screenshots/${name}.png`,
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

  async function screenshotWithFocusHighlight(
    buttonText: string | RegExp,
    name: string,
    args: PageScreenshotOptions = {}
  ) {
    await addFocusHighlight(buttonText);
    await screenshot(name, args);
    await removeFocusHighlight();
  }

  async function withContainerVerticallyExpanded(
    selector: string,
    callback: () => Promise<void>
  ) {
    // Get the overflow amount
    const overflowData = await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) return null;

      const { scrollHeight, clientHeight } = element;
      const overflowAmount = scrollHeight - clientHeight;

      return {
        overflowAmount,
        originalViewportHeight: window.innerHeight,
      };
    }, selector);

    if (!overflowData || overflowData.overflowAmount <= 0) {
      // No overflow, just run the callback
      await callback();
      return;
    }

    // Temporarily expand the viewport
    const newHeight =
      overflowData.originalViewportHeight + overflowData.overflowAmount;
    await page.setViewportSize({
      width: page.viewportSize()?.width ?? 1280,
      height: newHeight,
    });

    await page.waitForTimeout(100);

    // Run the callback (e.g., take screenshot)
    await callback();

    // Reset viewport
    await page.setViewportSize({
      width: page.viewportSize()?.width ?? 1280,
      height: overflowData.originalViewportHeight,
    });

    await page.waitForTimeout(100);
  }

  return {
    screenshot,
    screenshotWithFocusHighlight,
    clickModalButton,
    withContainerVerticallyExpanded,
  };
}

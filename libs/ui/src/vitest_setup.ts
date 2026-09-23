/**
 * jsdom does not implement `HTMLDialogElement`'s `show()`, `showModal()` and
 * `close()`. This fills in the parts of the browser behavior that tests can
 * observe: the `open` attribute, focus moving into the dialog and back out on
 * close, the `close` event, and everything outside a modal dialog becoming
 * inaccessible. Browsers make that outside content inert; here it's marked
 * `aria-hidden` so that Testing Library's accessible queries exclude it too.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex]';

const openModalDialogs: HTMLDialogElement[] = [];
const previouslyFocusedElements = new WeakMap<
  HTMLDialogElement,
  Element | null
>();
const originalAriaHiddenValues = new WeakMap<Element, string | null>();

function isFocusable(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.matches(FOCUSABLE_SELECTOR) &&
    !element.matches(':disabled') &&
    !element.closest('[inert]')
  );
}

function focusDialog(dialog: HTMLDialogElement) {
  const candidates = [
    ...dialog.querySelectorAll('[autofocus]'),
    ...dialog.querySelectorAll(FOCUSABLE_SELECTOR),
    dialog,
  ];
  candidates.find(isFocusable)?.focus();
}

function updateInertness() {
  const topmostDialog = openModalDialogs[openModalDialogs.length - 1];
  for (const element of document.body.children) {
    if (topmostDialog && element !== topmostDialog) {
      if (!originalAriaHiddenValues.has(element)) {
        originalAriaHiddenValues.set(
          element,
          element.getAttribute('aria-hidden')
        );
      }
      element.setAttribute('aria-hidden', 'true');
    } else if (originalAriaHiddenValues.has(element)) {
      const originalValue = originalAriaHiddenValues.get(element);
      originalAriaHiddenValues.delete(element);
      if (originalValue === null || originalValue === undefined) {
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('aria-hidden', originalValue);
      }
    }
  }
}

Object.assign(HTMLDialogElement.prototype, {
  show(this: HTMLDialogElement) {
    if (this.open) return;
    this.setAttribute('open', '');
    focusDialog(this);
  },

  showModal(this: HTMLDialogElement) {
    if (this.open) return;
    this.setAttribute('open', '');
    previouslyFocusedElements.set(this, document.activeElement);
    openModalDialogs.push(this);
    updateInertness();
    focusDialog(this);
  },

  close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.open) return;
    this.removeAttribute('open');
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }

    const index = openModalDialogs.indexOf(this);
    if (index !== -1) {
      openModalDialogs.splice(index, 1);
      updateInertness();
    }

    const previouslyFocusedElement = previouslyFocusedElements.get(this);
    if (
      this.contains(document.activeElement) &&
      previouslyFocusedElement instanceof HTMLElement
    ) {
      previouslyFocusedElement.focus();
    }

    this.dispatchEvent(new Event('close'));
  },
});

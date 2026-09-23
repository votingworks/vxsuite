import React, { ReactNode, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const openDialogs: HTMLDialogElement[] = [];
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tracks an open modal dialog until the returned function is called. */
export function registerOpenDialog(dialog: HTMLDialogElement): () => void {
  openDialogs.push(dialog);
  notifyListeners();
  return () => {
    openDialogs.splice(openDialogs.indexOf(dialog), 1);
    notifyListeners();
  };
}

/** Returns the most recently opened modal dialog that is still open. */
export function getTopmostOpenDialog(): HTMLDialogElement | undefined {
  return openDialogs[openDialogs.length - 1];
}

/** Like {@link getTopmostOpenDialog}, but re-renders when it changes. */
export function useTopmostOpenDialog(): HTMLDialogElement | undefined {
  return useSyncExternalStore(subscribe, getTopmostOpenDialog);
}

/**
 * Renders children inside the topmost open modal dialog, if there is one, so
 * they are shown above it and stay interactive. Everything outside a modal
 * dialog is inert and painted beneath it, regardless of `z-index`.
 */
export function TopLayerPortal({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const dialog = useTopmostOpenDialog();
  return dialog ? (
    createPortal(children, dialog)
  ) : (
    <React.Fragment>{children}</React.Fragment>
  );
}

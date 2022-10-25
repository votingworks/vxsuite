// eslint-disable-next-line import/no-unresolved
import React from 'react';

export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void;
export type InputChangeEventFunction =
  React.ChangeEventHandler<HTMLInputElement>;
export type TextareaChangeEventFunction =
  React.ChangeEventHandler<HTMLTextAreaElement>;
export type SelectChangeEventFunction =
  React.ChangeEventHandler<HTMLSelectElement>;
export type ElementWithCallback = (callback: () => void) => JSX.Element;

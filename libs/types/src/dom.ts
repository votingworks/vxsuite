// eslint-disable-next-line import/no-unresolved
import React from 'react';

export type SelectChangeEventFunction =
  React.ChangeEventHandler<HTMLSelectElement>;
export type ElementWithCallback = (callback: () => void) => JSX.Element;

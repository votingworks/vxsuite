// Enable keeping main public exports at the top of the file:
/* eslint-disable @typescript-eslint/no-use-before-define */

// TODO: This file's scope has gone out of sync with its current name/location -
// Need to break it up and/or rename/re-locate.

import React from 'react';
import {
  queries,
  render,
  RenderOptions,
  RenderResult,
  BoundFunctions,
  Queries,
  screen,
  BoundFunction,
  within,
} from '@testing-library/react';

import { ColorMode, ScreenType, SizeMode } from '@votingworks/types';
import { AppBase } from '../app_base';

/**
 * React Testing Library render options with additional VX-specific parameters.
 */
export type VxRenderOptions = RenderOptions & {
  vxTheme?: {
    colorMode?: ColorMode;
    screenType?: ScreenType;
    sizeMode?: SizeMode;
    isVisualModeDisabled?: boolean;
  };
};

/**
 * React Testing Library render result, with additional query functions from
 * {@link VxQueryFunctions}.
 */
export type VxRenderResult = RenderResult & VxQueryFunctions;

/**
 * React testing render function with UI theme support.
 * This is needed when rendering component trees that contain theme-dependent
 * components from libs/ui.
 */
export function renderWithThemes(
  ui: React.ReactElement,
  options: VxRenderOptions = {}
): VxRenderResult {
  const { vxTheme = {}, ...passthroughOptions } = options;

  function wrapper(props: { children: React.ReactNode }): JSX.Element {
    return (
      <AppBase
        defaultColorMode={vxTheme.colorMode ?? 'contrastMedium'}
        defaultSizeMode={vxTheme.sizeMode ?? 'touchSmall'}
        defaultIsVisualModeDisabled={vxTheme.isVisualModeDisabled ?? false}
        disableFontsForTests
        screenType={vxTheme.screenType}
        {...props}
      />
    );
  }

  const result = render(ui, { ...passthroughOptions, wrapper });

  return getVxQueryFunctions(result);
}

/**
 * React Testing Library screen utility, with additional convenience query
 * functions.
 *
 * See {@link VxQueryFunctions}
 */
export type VxScreen = typeof screen & VxQueryFunctions;

/**
 * React Testing Library {@link screen} utils, with additional query functions
 * from {@link VxQueryFunctions}.
 */
export const vxTestingLibraryScreen: VxScreen = getVxQueryFunctions(screen);

/**
 * An augmented React Testing Library {@link within} whose result includes
 * additional query functions from {@link VxQueryFunctions}.
 */
export function vxTestingLibraryWithinFn(
  element: HTMLElement
): BoundFunctions<typeof queries> & VxQueryFunctions {
  return getVxQueryFunctions(within(element));
}

/**
 * Custom VX element query functions added to React Testing Library for
 * convenience.
 */
export interface VxQueryFunctions {
  getAllButtons(
    buttonText: string | RegExp,
    opts?: ButtonQueryOptions
  ): ReturnType<queries.AllByRole>;
  getButton(
    buttonText: string | RegExp,
    opts?: ButtonQueryOptions
  ): ReturnType<queries.GetByRole>;
  findAllButtons(
    buttonText: string | RegExp,
    opts?: ButtonQueryOptions
  ): ReturnType<queries.FindAllByRole>;
  findButton(
    buttonText: string | RegExp,
    opts?: ButtonQueryOptions
  ): ReturnType<queries.FindByRole>;
  queryButton(
    buttonText: string | RegExp,
    opts?: ButtonQueryOptions
  ): ReturnType<queries.QueryByRole>;
  queryAllButtons(
    buttonText: string | RegExp,
    opts?: ButtonQueryOptions
  ): ReturnType<queries.AllByRole>;
}

/**
 * Optional parameters for button element queries in {@link VxQueryFunctions}.
 */
export interface ButtonQueryOptions {
  useSparinglyIncludeHidden?: boolean;
}

/**
 * Generic interface for scoped testing-library query containers like `screen`,
 * `RenderResult` and the return type of the `within()` utility.
 */
type ScopedQueryFunctions<Q extends Queries = typeof queries> =
  | BoundFunctions<typeof queries>
  | { [P in keyof Q]: BoundFunction<Q[P]> };

function getVxQueryFunctions<S extends ScopedQueryFunctions<typeof queries>>(
  scopedQueryFunctions: S
): S & VxQueryFunctions {
  return {
    ...scopedQueryFunctions, // eslint-disable-line vx/gts-spread-like-types
    getAllButtons(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return scopedQueryFunctions.getAllByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
    getButton(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return scopedQueryFunctions.getByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
    findAllButtons(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return scopedQueryFunctions.findAllByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
    findButton(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return scopedQueryFunctions.findByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
    queryButton(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return scopedQueryFunctions.queryByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
    queryAllButtons(
      buttonText: string | RegExp,
      opts: ButtonQueryOptions = {}
    ) {
      return scopedQueryFunctions.queryAllByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
  };
}

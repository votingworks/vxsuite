import React from 'react';
import {
  queries,
  render,
  RenderOptions,
  RenderResult,
} from '@testing-library/react';

import { ColorMode, SizeMode } from '@votingworks/types';
import { AppBase } from '../app_base';

export type VxRenderOptions = RenderOptions & {
  vxTheme?: {
    colorMode?: ColorMode;
    sizeMode?: SizeMode;
  };
};

export interface ButtonQueryOptions {
  useSparinglyIncludeHidden?: boolean;
}

export interface OptionQueryOptions {
  expectSelected?: boolean;
}

export type VxRenderResult = RenderResult & {
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
};

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
        colorMode={vxTheme.colorMode}
        sizeMode={vxTheme.sizeMode}
        {...props}
      />
    );
  }

  const result = render(ui, { ...passthroughOptions, wrapper });

  return {
    ...result,
    getAllButtons(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return result.getAllByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
    getButton(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return result.getByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
    findAllButtons(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return result.findAllByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
    findButton(buttonText: string | RegExp, opts: ButtonQueryOptions = {}) {
      return result.findByRole('button', {
        name: buttonText,
        hidden: opts.useSparinglyIncludeHidden,
      });
    },
  };
}

/**
 * Overrides create-react-app's webpack config without ejecting, powered by
 * react-app-rewired.
 *
 * Adapted from https://nx.dev/react/migration/migration-cra
 */

// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path')
const { TsconfigPathsPlugin } = require('tsconfig-paths-webpack-plugin')
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin')
const { pathsToModuleNameMapper } = require('ts-jest/utils')
const { loadConfig } = require('tsconfig-paths')
const { join } = require('path')

module.exports = {
  /**
   * @param {import('webpack').Configuration} config
   */
  webpack(config) {
    // Remove guard against importing modules outside of `src`.
    // Needed for workspace projects.
    config.resolve.plugins = config.resolve.plugins.filter(
      (plugin) => !(plugin instanceof ModuleScopePlugin)
    )

    // Add support for importing workspace projects.
    config.resolve.plugins.push(
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, 'tsconfig.json'),
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        mainFields: ['module', 'main'],
      })
    )

    // Replace include option for babel loader with exclude
    // so babel will handle workspace projects as well.
    for (const r of config.module.rules) {
      if (r.oneOf) {
        const babelLoader = r.oneOf.find(
          (rr) =>
            (Array.isArray(rr.loader) || typeof rr.loader === 'string') &&
            rr.loader.indexOf('babel-loader') !== -1
        )
        babelLoader.exclude = /node_modules/
        delete babelLoader.include
      }
    }

    return config
  },

  /**
   * @param {import('@jest/types/build/Config').ProjectConfig} config
   */
  jest(config) {
    // Loads tsconfig for this project, which in turn extends the root
    // tsconfig.json. Paths in `paths` are used as-is, and are relative to the
    // root of the monorepo, i.e. `apps/client/…`.
    const tsconfig = loadConfig(join(__dirname, '../..'))

    if (tsconfig.resultType === 'failed') {
      throw new Error('unable to load tsconfig.json for this project')
    }

    return {
      ...config,
      moduleNameMapper: pathsToModuleNameMapper(tsconfig.paths, {
        // i.e. /path/to/monorepo/
        prefix: `${tsconfig.absoluteBaseUrl}/`,
      }),
    }
  },
}

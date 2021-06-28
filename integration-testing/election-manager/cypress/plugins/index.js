import { promises as fs } from 'fs'
import path from 'path'

/// <reference types="cypress" />
// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

/**
 * @type {Cypress.PluginConfig}
 */
// eslint-disable-next-line no-unused-vars
module.exports = (on, config) => {
  // `on` is used to hook into various events Cypress emits
  // `config` is the resolved Cypress config
  on('task', {
    async readMostRecentFile(directoryPath) {
      const files = await fs.readdir(directoryPath)
      const paths = files.map((file) => path.join(directoryPath, file))
      const ctimes = await Promise.all(
        paths.map(async (p) => (await fs.stat(p)).ctime.getTime())
      )
      const mostRecentCtime = Math.max(...ctimes)
      const mostRecentPath = paths[ctimes.indexOf(mostRecentCtime)]
      return await fs.readFile(mostRecentPath, 'utf-8')
    },
  })
}

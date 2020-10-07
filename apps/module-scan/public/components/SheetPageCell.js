/**
 * @typedef {import('../../src/interpreter').PageInterpretation} PageInterpretation
 */

/**
 * @typedef {object} Sheet
 * @property {string} id
 * @property {string} batchId
 * @property {PageInterpretation} frontInterpretation
 * @property {PageInterpretation} backInterpretation
 */

/**
 * @param {import('@votingworks/ballot-encoder').BallotType} ballotType
 * @returns {string}
 */
function describeBallotType(ballotType) {
  switch (ballotType) {
    case 0:
      return 'standard'
    case 1:
      return 'absentee'
    case 2:
      return 'provisional'
    default:
      return 'unknown'
  }
}

/**
 * @param {import('@votingworks/ballot-encoder').BallotLocale} locales
 * @returns {string}
 */
function describeLocales(locales) {
  if (locales.secondary) {
    return `${locales.primary}/${locales.secondary}`
  } else {
    return locales.primary
  }
}

/**
 * @param {import('@votingworks/hmpb-interpreter').BallotPageMetadata | import('../../src/types').BallotMetadata} metadata
 * @returns {string}
 */
function describeMetadata(metadata) {
  const { ballotStyleId, precinctId, ballotType, locales } = metadata
  const description = `bs=${ballotStyleId} pr=${precinctId} type=${describeBallotType(
    ballotType
  )} l10n=${describeLocales(locales)}`

  if ('pageNumber' in metadata) {
    return `page=${metadata.pageNumber} ${description}`
  } else {
    return description
  }
}

/**
 * @param {PageInterpretation} interpretation
 */
function interpretationTitle(interpretation) {
  switch (interpretation.type) {
    case 'BlankPage':
      return 'blank'

    case 'InterpretedBmdPage':
      return 'BMD'

    case 'InterpretedHmpbPage':
      return 'HMPB'

    case 'InvalidTestModePage':
      return 'invalid test mode'

    case 'UninterpretedHmpbPage':
      return 'HMPB (uninterpreted)'

    case 'UnreadablePage':
      return 'unreadable'

    default:
      // @ts-expect-error
      return interpretation.type
  }
}

/**
 * @typedef {object} Props
 * @property {PageInterpretation} interpretation
 */

/**
 * @param {Props} param0
 */
const SheetPageCell = ({ interpretation }) => {
  return h('td', { className: 'sheet-page-cell' }, [
    h(
      'div',
      { className: 'sheet-page-cell--title', key: 'title' },
      interpretationTitle(interpretation)
    ),
    h(
      'div',
      { className: 'sheet-page-cell--subtitle', key: 'subtitle' },
      'metadata' in interpretation
        ? describeMetadata(interpretation.metadata)
        : 'n/a'
    ),
  ])
}

export default SheetPageCell

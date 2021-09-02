import gtsNoPrivateFields from './gts-no-private-fields'
import gtsParameterProperties from './gts-parameter-properties'
import noArraySortMutation from './no-array-sort-mutation'
import noAssertStringOrNumber from './no-assert-truthiness'
import noFloatingVoids from './no-floating-results'

export default {
  'gts-no-private-fields': gtsNoPrivateFields,
  'gts-parameter-properties': gtsParameterProperties,
  'no-array-sort-mutation': noArraySortMutation,
  'no-assert-truthiness': noAssertStringOrNumber,
  'no-floating-results': noFloatingVoids,
}

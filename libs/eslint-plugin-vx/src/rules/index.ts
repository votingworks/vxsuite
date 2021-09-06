import gtsDirectModuleExportAccessOnly from './gts-direct-module-export-access-only'
import gtsNoArrayConstructor from './gts-no-array-constructor'
import gtsNoPrivateFields from './gts-no-private-fields'
import gtsNoPublicModifier from './gts-no-public-modifier'
import gtsParameterProperties from './gts-parameter-properties'
import noArraySortMutation from './no-array-sort-mutation'
import noAssertStringOrNumber from './no-assert-truthiness'
import noFloatingVoids from './no-floating-results'

export default {
  'gts-direct-module-export-access-only': gtsDirectModuleExportAccessOnly,
  'gts-no-array-constructor': gtsNoArrayConstructor,
  'gts-no-private-fields': gtsNoPrivateFields,
  'gts-no-public-modifier': gtsNoPublicModifier,
  'gts-parameter-properties': gtsParameterProperties,
  'no-array-sort-mutation': noArraySortMutation,
  'no-assert-truthiness': noAssertStringOrNumber,
  'no-floating-results': noFloatingVoids,
}

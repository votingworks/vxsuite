import { TSESLint } from '@typescript-eslint/experimental-utils';
import gtsArrayTypeStyle from './gts-array-type-style';
import gtsDirectModuleExportAccessOnly from './gts-direct-module-export-access-only';
import gtsFuncStyle from './gts-func-style';
import gtsNoArrayConstructor from './gts-no-array-constructor';
import gtsNoDollarSignNames from './gts-no-dollar-sign-names';
import gtsNoForeach from './gts-no-foreach';
import gtsNoForInLoop from './gts-no-for-in-loop';
import gtsNoImportExportType from './gts-no-import-export-type';
import gtsNoObjectLiteralTypeAssertions from './gts-no-object-literal-type-assertions';
import gtsNoPrivateFields from './gts-no-private-fields';
import gtsNoPublicModifier from './gts-no-public-modifier';
import gtsNoReturnTypeOnlyGenerics from './gts-no-return-type-only-generics';
import gtsNoUnnecessaryHasOwnPropertyCheck from './gts-no-unnecessary-has-own-property-check';
import gtsParameterProperties from './gts-parameter-properties';
import gtsUseOptionals from './gts-use-optionals';
import noArraySortMutation from './no-array-sort-mutation';
import noAssertStringOrNumber from './no-assert-truthiness';
import noFloatingVoids from './no-floating-results';
import gtsIdentifiersUseAllowedCharacters from './gts-identifiers-use-allowed-characters';

const rules: Record<
  string,
  TSESLint.RuleModule<string, readonly unknown[], TSESLint.RuleListener>
> = {
  'gts-array-type-style': gtsArrayTypeStyle,
  'gts-direct-module-export-access-only': gtsDirectModuleExportAccessOnly,
  'gts-func-style': gtsFuncStyle,
  'gts-identifiers-use-allowed-character': gtsIdentifiersUseAllowedCharacters,
  'gts-no-array-constructor': gtsNoArrayConstructor,
  'gts-no-dollar-sign-names': gtsNoDollarSignNames,
  'gts-no-foreach': gtsNoForeach,
  'gts-no-for-in-loop': gtsNoForInLoop,
  'gts-no-import-export-type': gtsNoImportExportType,
  'gts-no-object-literal-type-assertions': gtsNoObjectLiteralTypeAssertions,
  'gts-no-private-fields': gtsNoPrivateFields,
  'gts-no-public-modifier': gtsNoPublicModifier,
  'gts-no-return-type-only-generics': gtsNoReturnTypeOnlyGenerics,
  'gts-no-unnecessary-has-own-property-check':
    gtsNoUnnecessaryHasOwnPropertyCheck,
  'gts-parameter-properties': gtsParameterProperties,
  'gts-use-optionals': gtsUseOptionals,
  'no-array-sort-mutation': noArraySortMutation,
  'no-assert-truthiness': noAssertStringOrNumber,
  'no-floating-results': noFloatingVoids,
};

export default rules;

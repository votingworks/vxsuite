import { TSESLint } from '@typescript-eslint/experimental-utils';
import gtsArrayTypeStyle from './gts_array_type_style';
import gtsDirectModuleExportAccessOnly from './gts_direct_module_export_access_only';
import gtsFuncStyle from './gts_func_style';
import gtsIdentifiersUseAllowedCharacters from './gts_identifiers_use_allowed_characters';
import gtsJsdoc from './gts_jsdoc';
import gtsNoArrayConstructor from './gts_no_array_constructor';
import gtsNoConstEnum from './gts_no_const_enum';
import gtsNoDefaultExports from './gts_no_default_exports';
import gtsNoDollarSignNames from './gts_no_dollar_sign_names';
import gtsNoForInLoop from './gts_no_for_in_loop';
import gtsNoForeach from './gts_no_foreach';
import gtsNoImportExportType from './gts_no_import_export_type';
import gtsNoObjectLiteralTypeAssertions from './gts_no_object_literal_type_assertions';
import gtsNoPrivateFields from './gts_no_private_fields';
import gtsNoPublicClassFields from './gts_no_public_class_fields';
import gtsNoPublicModifier from './gts_no_public_modifier';
import gtsNoReturnTypeOnlyGenerics from './gts_no_return_type_only_generics';
import gtsNoUnnecessaryHasOwnPropertyCheck from './gts_no_unnecessary_has_own_property_check';
import gtsParameterProperties from './gts_parameter_properties';
import gtsSafeNumberParse from './gts_safe_number_parse';
import gtsSpreadLikeTypes from './gts_spread_like_types';
import gtsTypeParameters from './gts_type_parameters';
import gtsUnicodeEscapes from './gts_unicode_escapes';
import gtsUseOptionals from './gts_use_optionals';
import noArraySortMutation from './no_array_sort_mutation';
import noAssertStringOrNumber from './no_assert_truthiness';
import noFloatingVoids from './no_floating_results';

const rules: Record<
  string,
  TSESLint.RuleModule<string, readonly unknown[], TSESLint.RuleListener>
> = {
  'gts-array-type-style': gtsArrayTypeStyle,
  'gts-direct-module-export-access-only': gtsDirectModuleExportAccessOnly,
  'gts-func-style': gtsFuncStyle,
  'gts-identifiers-use-allowed-character': gtsIdentifiersUseAllowedCharacters,
  'gts-jsdoc': gtsJsdoc,
  'gts-no-array-constructor': gtsNoArrayConstructor,
  'gts-no-const-enum': gtsNoConstEnum,
  'gts-no-default-exports': gtsNoDefaultExports,
  'gts-no-dollar-sign-names': gtsNoDollarSignNames,
  'gts-no-foreach': gtsNoForeach,
  'gts-no-for-in-loop': gtsNoForInLoop,
  'gts-no-import-export-type': gtsNoImportExportType,
  'gts-no-object-literal-type-assertions': gtsNoObjectLiteralTypeAssertions,
  'gts-no-private-fields': gtsNoPrivateFields,
  'gts-no-public-class-fields': gtsNoPublicClassFields,
  'gts-no-public-modifier': gtsNoPublicModifier,
  'gts-no-return-type-only-generics': gtsNoReturnTypeOnlyGenerics,
  'gts-no-unnecessary-has-own-property-check':
    gtsNoUnnecessaryHasOwnPropertyCheck,
  'gts-parameter-properties': gtsParameterProperties,
  'gts-safe-number-parse': gtsSafeNumberParse,
  'gts-spread-like-types': gtsSpreadLikeTypes,
  'gts-type-parameters': gtsTypeParameters,
  'gts-unicode-escapes': gtsUnicodeEscapes,
  'gts-use-optionals': gtsUseOptionals,
  'no-array-sort-mutation': noArraySortMutation,
  'no-assert-truthiness': noAssertStringOrNumber,
  'no-floating-results': noFloatingVoids,
};

export default rules;

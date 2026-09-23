import type { Rule } from 'eslint';
import gtsArrayTypeStyle from './gts_array_type_style.js';
import gtsConstants from './gts_constants.js';
import gtsDirectModuleExportAccessOnly from './gts_direct_module_export_access_only.js';
import gtsFuncStyle from './gts_func_style.js';
import gtsIdentifiers from './gts_identifiers.js';
import gtsJsdoc from './gts_jsdoc.js';
import gtsModuleSnakeCase from './gts_module_snake_case.js';
import gtsNoArrayConstructor from './gts_no_array_constructor.js';
import gtsNoConstEnum from './gts_no_const_enum.js';
import gtsNoDefaultExports from './gts_no_default_exports.js';
import gtsNoForeach from './gts_no_foreach.js';
import gtsNoForInLoop from './gts_no_for_in_loop.js';
import gtsNoImportExportType from './gts_no_import_export_type.js';
import gtsNoPrivateFields from './gts_no_private_fields.js';
import gtsNoPublicClassFields from './gts_no_public_class_fields.js';
import gtsNoPublicModifier from './gts_no_public_modifier.js';
import gtsNoReturnTypeOnlyGenerics from './gts_no_return_type_only_generics.js';
import gtsNoUnnecessaryHasOwnPropertyCheck from './gts_no_unnecessary_has_own_property_check.js';
import gtsObjectLiteralTypes from './gts_object_literal_types.js';
import gtsParameterProperties from './gts_parameter_properties.js';
import gtsSafeNumberParse from './gts_safe_number_parse.js';
import gtsSpreadLikeTypes from './gts_spread_like_types.js';
import gtsTypeParameters from './gts_type_parameters.js';
import gtsUnicodeEscapes from './gts_unicode_escapes.js';
import gtsUseOptionals from './gts_use_optionals.js';
import noArraySortMutation from './no_array_sort_mutation.js';
import noAssertStringOrNumber from './no_assert_truthiness.js';
import noFloatingVoids from './no_floating_results.js';
import noAssertResultPredicates from './no_assert_result_predicates.js';
import noImportSubfolders from './no_import_workspace_subfolders.js';
import noEsmWorkspaceImportInTestSetup from './no_esm_workspace_import_in_test_setup.js';
import noExpectToBe from './no_expect_to_be.js';
import noManualSleep from './no_manual_sleep.js';
import noReactHookMutationDependency from './no_react_hook_mutation_dependency.js';
import noRefetchInterval from './no_refetch_interval.js';

const rules: Record<string, Rule.RuleModule> = {
  'gts-array-type-style': gtsArrayTypeStyle,
  'gts-constants': gtsConstants,
  'gts-direct-module-export-access-only': gtsDirectModuleExportAccessOnly,
  'gts-func-style': gtsFuncStyle,
  'gts-identifiers': gtsIdentifiers,
  'gts-jsdoc': gtsJsdoc,
  'gts-module-snake-case': gtsModuleSnakeCase,
  'gts-no-array-constructor': gtsNoArrayConstructor,
  'gts-no-const-enum': gtsNoConstEnum,
  'gts-no-default-exports': gtsNoDefaultExports,
  'gts-no-foreach': gtsNoForeach,
  'gts-no-for-in-loop': gtsNoForInLoop,
  'gts-no-import-export-type': gtsNoImportExportType,
  'gts-no-private-fields': gtsNoPrivateFields,
  'gts-no-public-class-fields': gtsNoPublicClassFields,
  'gts-no-public-modifier': gtsNoPublicModifier,
  'gts-no-return-type-only-generics': gtsNoReturnTypeOnlyGenerics,
  'gts-no-unnecessary-has-own-property-check':
    gtsNoUnnecessaryHasOwnPropertyCheck,
  'gts-object-literal-types': gtsObjectLiteralTypes,
  'gts-parameter-properties': gtsParameterProperties,
  'gts-safe-number-parse': gtsSafeNumberParse,
  'gts-spread-like-types': gtsSpreadLikeTypes,
  'gts-type-parameters': gtsTypeParameters,
  'gts-unicode-escapes': gtsUnicodeEscapes,
  'gts-use-optionals': gtsUseOptionals,
  'no-array-sort-mutation': noArraySortMutation,
  'no-assert-truthiness': noAssertStringOrNumber,
  'no-assert-result-predicates': noAssertResultPredicates,
  'no-floating-results': noFloatingVoids,
  'no-esm-workspace-import-in-test-setup': noEsmWorkspaceImportInTestSetup,
  'no-import-workspace-subfolders': noImportSubfolders,
  'no-expect-to-be': noExpectToBe,
  'no-manual-sleep': noManualSleep,
  'no-react-hook-mutation-dependency': noReactHookMutationDependency,
  'no-refetch-interval': noRefetchInterval,
} as unknown as Record<string, Rule.RuleModule>;

export default rules;

import {
  AST_NODE_TYPES,
  TSESTree,
} from '@typescript-eslint/experimental-utils';
import { createRule } from '../util';

function convertToCamelCase(name: string): string {
  return name.replace(
    /[A-Z]{2,}/g,
    ([initial, ...rest]) => initial + rest.join('').toLowerCase()
  );
}

function hasPartialCaps(name: string): boolean {
  return name.toUpperCase() !== name && /[A-Z]{2}/.test(name);
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export default createRule({
  name: 'gts-identifiers',
  meta: {
    docs: {
      description:
        'Disallows use of $ in identifiers, except when aligning with naming conventions for third party frameworks.',
      recommended: 'error',
      suggestion: true,
      requiresTypeChecking: false,
    },
    messages: {
      noAbbreviations: `Treat abbreviations like acronyms in names as whole words`,
      identifiersAllowedCharacters: `Identifiers must use only allowed characters: ASCII letters, digits, underscores and the '(' sign`,
      noDollarSign: `Do not use $ in names`,
      useCamelCase: `Use camel case: {{asCamelCase}}`,
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowedNames: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    type: 'problem',
  },
  defaultOptions: [{ allowedNames: [] as string[] }],

  create(context) {
    const { allowedNames = [] } = context.options[0] ?? {};
    const allowedNamesPattern = new RegExp(
      `^${allowedNames
        .map((allowedName) =>
          /^\/.*\/$/.test(allowedName)
            ? `(${allowedName.slice(1, -1)})`
            : escapeRegExp(allowedName)
        )
        .join('|')}$`
    );
    const processedScopes = new Set<ReturnType<typeof context['getScope']>>();

    function isAllowedName(name: string): boolean {
      return allowedNamesPattern.test(name);
    }

    function checkIdentifier(node: TSESTree.Identifier): void {
      if (isAllowedName(node.name)) {
        return;
      }

      if (node.name.includes('$')) {
        context.report({
          messageId: 'noDollarSign',
          node,
        });
      }

      if (!/^[$)\w]+$/.test(node.name)) {
        context.report({
          messageId: 'identifiersAllowedCharacters',
          node,
        });
      }

      if (hasPartialCaps(node.name)) {
        const asCamelCase = convertToCamelCase(node.name);
        context.report({
          node,
          messageId: 'noAbbreviations',
          suggest: [
            {
              messageId: 'useCamelCase',
              fix: (fixer) => fixer.replaceText(node, asCamelCase),
              data: { asCamelCase },
            },
          ],
        });
      }
    }

    return {
      TSPropertySignature(node: TSESTree.TSPropertySignature): void {
        if (node.computed) {
          return;
        }

        if (node.key.type === AST_NODE_TYPES.Identifier) {
          checkIdentifier(node.key);
        }
      },

      ObjectExpression(node: TSESTree.ObjectExpression): void {
        for (const property of node.properties) {
          if (
            property.type !== AST_NODE_TYPES.SpreadElement &&
            property.key.type === AST_NODE_TYPES.Identifier
          ) {
            checkIdentifier(property.key);
          }
        }
      },

      '*': (): void => {
        const scope = context.getScope();
        if (processedScopes.has(scope)) {
          return;
        }
        processedScopes.add(scope);

        for (const variable of scope.variables) {
          const [id] = variable.identifiers;
          const [def] = variable.defs;

          if (!id || !def) {
            continue;
          }

          if (def.node.type === AST_NODE_TYPES.ImportSpecifier) {
            continue;
          }

          checkIdentifier(id);
        }
      },
    };
  },
});

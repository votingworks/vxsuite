import {
  AST_NODE_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../util/index.ts';

const CHILD_PROCESS_MODULES = new Set(['child_process', 'node:child_process']);
const SHELL_FUNCTIONS = new Set(['exec', 'execSync']);

function propertyName(
  node: TSESTree.MemberExpression | TSESTree.Property
): string | undefined {
  const key = node.type === AST_NODE_TYPES.Property ? node.key : node.property;
  if (key.type === AST_NODE_TYPES.Literal) {
    return typeof key.value === 'string' ? key.value : undefined;
  }
  return !node.computed && key.type === AST_NODE_TYPES.Identifier
    ? key.name
    : undefined;
}

function enablesShell(property: TSESTree.Property): boolean {
  return !(
    property.value.type === AST_NODE_TYPES.Literal &&
    property.value.value === false
  );
}

const rule: TSESLint.RuleModule<
  'shellFunction' | 'shellOption',
  readonly unknown[]
> = createRule({
  name: 'no-shell-child-process',
  meta: {
    docs: {
      description:
        'Disallow `child_process` calls that run their command through a shell',
    },
    messages: {
      shellFunction:
        '`{{ name }}` runs its command through a shell. Use `execFile`, `execFileSync` or `spawn` with an argument array instead.',
      shellOption:
        'Do not enable `shell` for `child_process` calls. Pass the command and its arguments as an array instead.',
    },
    schema: [],
    type: 'problem',
  },
  defaultOptions: [],

  create(context) {
    const importedFunctions = new Set<string>();
    const importedNamespaces = new Set<string>();

    function isChildProcessCallee(callee: TSESTree.Expression): boolean {
      if (callee.type === AST_NODE_TYPES.Identifier) {
        return importedFunctions.has(callee.name);
      }
      return (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        callee.object.type === AST_NODE_TYPES.Identifier &&
        importedNamespaces.has(callee.object.name)
      );
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (!CHILD_PROCESS_MODULES.has(node.source.value)) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
            importedNamespaces.add(specifier.local.name);
            continue;
          }
          const imported =
            specifier.imported.type === AST_NODE_TYPES.Identifier
              ? specifier.imported.name
              : specifier.imported.value;
          if (SHELL_FUNCTIONS.has(imported)) {
            context.report({
              node: specifier,
              messageId: 'shellFunction',
              data: { name: imported },
            });
          }
          importedFunctions.add(specifier.local.name);
        }
      },

      MemberExpression(node: TSESTree.MemberExpression) {
        if (
          node.object.type !== AST_NODE_TYPES.Identifier ||
          !importedNamespaces.has(node.object.name)
        ) {
          return;
        }
        const name = propertyName(node);
        if (name !== undefined && SHELL_FUNCTIONS.has(name)) {
          context.report({ node, messageId: 'shellFunction', data: { name } });
        }
      },

      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.Super ||
          !isChildProcessCallee(node.callee)
        ) {
          return;
        }
        for (const argument of node.arguments) {
          if (argument.type !== AST_NODE_TYPES.ObjectExpression) continue;
          for (const property of argument.properties) {
            if (
              property.type === AST_NODE_TYPES.Property &&
              propertyName(property) === 'shell' &&
              enablesShell(property)
            ) {
              context.report({ node: property, messageId: 'shellOption' });
            }
          }
        }
      },
    };
  },
});

export default rule;

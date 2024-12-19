import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { strict as assert } from 'node:assert';
import {
  CollectionType,
  createRule,
  FunctionType,
  getCollectionType,
  isBindingName,
  isFunction,
} from '../util';

/**
 * Contains information about a `forEach` call.
 */
interface ForEach {
  /**
   * The node of the call itself, i.e. `array.forEach(…)`.
   */
  readonly forEachCall: TSESTree.CallExpression;

  /**
   * The node of the `forEach` identifier, i.e. `forEach` in `array.forEach(…)`.
   */
  readonly forEachIdentifier: TSESTree.Identifier;

  /**
   * The node of the expression whose `forEach` method is being called, i.e.
   * `array` in `array.forEach(…)`.
   */
  readonly collection: TSESTree.Expression;
}

/**
 * Tracks pending transforms of a `forEach` call into `for-of`.
 */
interface TransformableForEach extends ForEach {
  /**
   * The type of the collection, changes how the `for-of` is generated.
   */
  readonly collectionType: CollectionType;

  /**
   * The current level of function nesting when the `forEach` was encountered.
   * Used to ensure only `return`s immediately inside the `forEach` callback
   * are transformed.
   */
  readonly functionLevel: number;

  /**
   * The node for the value inside the loop, i.e. `e` in
   * `array.forEach((e) => …)`.
   */
  readonly valueBinding: TSESTree.BindingName;

  /**
   * The optional node for the index inside the loop, i.e. `i` in
   * `array.forEach((e, i) => …)`.
   */
  readonly indexBinding?: TSESTree.BindingName;

  /**
   * The node of the function passed to `forEach`.
   */
  readonly callback: FunctionType;

  /**
   * The `return`s inside `callback` that should be transformed into
   * `continue`s. This array will be updated as the callback function is
   * traversed.
   */
  readonly returns: TSESTree.ReturnStatement[];

  /**
   * Initially true, will be set to false if in visiting the callback function
   * it is determined that this `forEach` cannot actually be transformed into
   * a `for-of`.
   */
  fixable: boolean;
}

const rule: TSESLint.RuleModule<'noForEach', readonly unknown[]> = createRule({
  name: 'gts-no-foreach',
  meta: {
    docs: {
      description:
        'Disallows use of `Array.prototype.forEach`, `Set.prototype.forEach`, and `Map.prototype.forEach`',
      recommended: 'stylistic',
      requiresTypeChecking: true,
    },
    messages: {
      noForEach:
        'Do not use `forEach`. Instead, use `for-of` or a more appropriate functional method.',
    },
    schema: [],
    type: 'problem',
    fixable: 'code',
  },
  defaultOptions: [],

  create(context) {
    const parserServices = ESLintUtils.getParserServices(context);
    const checker = parserServices.program.getTypeChecker();
    const sourceCode = context.getSourceCode();
    const forEachStack: TransformableForEach[] = [];
    let functionLevel = 0;

    /**
     * If `node` is able to be transformed into a `for-of`, returns metadata
     * required to complete the transformation.
     */
    function getForEachInfo(
      node: TSESTree.Node
    ): ForEach | TransformableForEach | undefined {
      if (
        node.type !== AST_NODE_TYPES.CallExpression ||
        node.callee.type !== AST_NODE_TYPES.MemberExpression ||
        node.callee.computed ||
        node.callee.property.type !== AST_NODE_TYPES.Identifier ||
        node.callee.property.name !== 'forEach'
      ) {
        return;
      }

      const forEachCall = node;
      const collection = node.callee.object;
      const forEachIdentifier = node.callee.property;

      // Only consider some types, i.e. Array/Set/Map.
      const collectionType = getCollectionType(
        checker,
        parserServices.esTreeNodeToTSNodeMap.get(collection)
      );

      if (!collectionType) {
        return { forEachCall, forEachIdentifier, collection };
      }

      if (node.arguments.length !== 1) {
        return { forEachCall, forEachIdentifier, collection };
      }

      const callback = node.arguments[0];

      if (callback.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
        return { forEachCall, forEachIdentifier, collection };
      }

      assert(node.parent);
      if (node.parent.type !== AST_NODE_TYPES.ExpressionStatement) {
        return { forEachCall, forEachIdentifier, collection };
      }

      const [valueParam, indexParam, arrayParam] = callback.params as Array<
        TSESTree.Parameter | undefined
      >;

      if (
        arrayParam ||
        !valueParam ||
        !isBindingName(valueParam) ||
        (indexParam && !isBindingName(indexParam))
      ) {
        return { forEachCall, forEachIdentifier, collection };
      }

      return {
        forEachCall,
        forEachIdentifier,
        functionLevel,
        collectionType,
        callback,
        collection,
        valueBinding: valueParam,
        indexBinding: indexParam,
        fixable: collectionType !== 'map' || !!indexParam,
        returns: [],
      };
    }

    return {
      '*': (node: TSESTree.Node): void => {
        if (isFunction(node)) {
          functionLevel += 1;
        }

        const forEach = getForEachInfo(node);

        if (!forEach) {
          return;
        }

        // Only consider some types, i.e. Array/Set/Map.
        const collectionType = getCollectionType(
          checker,
          parserServices.esTreeNodeToTSNodeMap.get(forEach.collection)
        );
        if (!collectionType) {
          return;
        }

        if ('fixable' in forEach) {
          // fixable `forEach` needs more information, so defer the report
          forEachStack.push(forEach);
        } else {
          // can't fix it, so just report it immediately
          context.report({
            messageId: 'noForEach',
            node,
          });
        }
      },

      /**
       * Identifies return statements that may need to be turned into
       * `continue`s.
       */
      ReturnStatement(node: TSESTree.ReturnStatement): void {
        const currentForEach = forEachStack.at(-1);

        if (currentForEach?.functionLevel !== functionLevel - 1) {
          return;
        }

        if (node.argument) {
          currentForEach.fixable = false;
        } else {
          currentForEach.returns.push(node);
        }
      },

      '*:exit': (node: TSESTree.Node) => {
        if (isFunction(node)) {
          functionLevel -= 1;
        }

        if (node.type === AST_NODE_TYPES.Program) {
          /* istanbul ignore next */
          assert.equal(
            forEachStack.length,
            0,
            `BUG: outstanding forEach metadata found; the exit handler for a \`forEach\` call on line ${forEachStack[0]?.forEachCall.loc.start.line} did not remove its entry from the stack`
          );
        }

        if (node.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }

        const currentForEach = forEachStack.at(-1);
        if (currentForEach?.forEachCall !== node) {
          return;
        }
        forEachStack.pop();

        if (!currentForEach.fixable) {
          context.report({
            messageId: 'noForEach',
            node,
          });
        } else {
          const {
            collectionType,
            forEachCall,
            forEachIdentifier,
            callback,
            collection,
            valueBinding,
            indexBinding,
            returns,
          } = currentForEach;
          const closingParen = sourceCode.getLastToken(forEachCall);

          /* istanbul ignore next */
          assert.equal(closingParen?.value, ')');

          const dotBetweenCollectionAndForEach =
            sourceCode.getFirstTokenBetween(collection, forEachIdentifier, {
              filter: (token) => token.value === '.',
            });
          assert(dotBetweenCollectionAndForEach);

          context.report({
            messageId: 'noForEach',
            node,
            fix: (fixer) => [
              fixer.insertTextBeforeRange(
                node.range,
                `for (const ${
                  indexBinding
                    ? `[${sourceCode.getText(
                        indexBinding
                      )}, ${sourceCode.getText(valueBinding)}]`
                    : sourceCode.getText(valueBinding)
                } of `
              ),
              fixer.replaceTextRange(
                [
                  dotBetweenCollectionAndForEach.range[0],
                  callback.body.range[0],
                ],
                indexBinding && collectionType !== 'map' ? '.entries()) ' : ') '
              ),
              fixer.removeRange(closingParen.range),
              ...returns.map(({ range }) =>
                fixer.replaceTextRange(range, 'continue')
              ),
            ],
          });
        }
      },
    };
  },
});

export default rule;

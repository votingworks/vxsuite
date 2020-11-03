function isDirectAccess(node) {
  if (node.type === 'Identifier') {
    return true
  }

  if (node.type === 'MemberExpression') {
    return isDirectAccess(node.object)
  }

  return false
}

module.exports = {
  create(context) {
    return {
      CallExpression({ callee }) {
        if (
          callee.type !== 'MemberExpression' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'sort'
        ) {
          return
        }

        if (isDirectAccess(callee.object)) {
          context.report({
            node: callee.property,
            message: '`sort` modifies its array; please make a copy first',
          })
        }
      },
    }
  },
}

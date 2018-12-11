var flatten = function (arr) {
  return [].concat.apply([], arr);
}

function ImportDeclaration(t, path, state) {
  var node = path.node,
    scope = path.scope;

  node.specifiers = flatten(node.specifiers.map(function (spec) {
    if (!t.isImportNamespaceSpecifier(spec)) {
      return spec;
    }

    var binding = scope.getBinding(spec.local.name),
      usages = binding.referencePaths,
      noShadows = binding.constantViolations.length === 0;

    var canReplace = noShadows && usages.every(function (u) {
      var container = u.container;
      return (
        t.isMemberExpression(container) && !container.computed
      ) || (
        t.isJSXMemberExpression(container)
      );
    });

    if (!canReplace) {
      return spec;
    }

    var newSpecs = [],
      props = [],
      newIdents = Object.create(null);

    usages.forEach(function (u) {
      var name = u.container.property.name,
        newIdent;

      if (newIdents[name]) {
        newIdent = newIdents[name];
      } else {
        newIdent = newIdents[name] = scope.generateUidIdentifier(name);
        newSpecs.push(
          t.importSpecifier(newIdent, t.identifier(name))
        );
        props.push(t.objectProperty(t.identifier(name), newIdent));
      }

      u.container = newIdent;
    });

    if (props.length > 0) {
      path.insertAfter(
        t.variableDeclaration('var', [
          t.variableDeclarator(spec.local, t.objectExpression(props))
        ])
      );
    }

    return newSpecs;
  }));
}

module.exports = function resolveWildcardImports(babel) {
  return {
    visitor: {
      ImportDeclaration: ImportDeclaration.bind(null, babel.types)
    }
  }
}

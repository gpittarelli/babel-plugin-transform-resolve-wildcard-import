var flatten = function (arr) {
  return [].concat.apply([], arr);
}

function shouldTransform(importName, opts) {
  if (!opts) {
    return true;
  }

  if (opts.only) {
    opts = opts.only;
  }

  if (typeof opts === 'string') {
    opts = [opts];
  }

  if (Array.isArray(opts)) {
    for (var i = 0; i < opts.length; ++i) {
      if ((new RegExp(opts[i])).exec(importName)) {
        return true;
      }
    }
    return false;
  }

  return true;
}

function checkDestructure(t, localName, container) {
  switch (true) {
    case !t.isVariableDeclarator(container):
    case !t.isObjectPattern(container.id):
    case !t.isIdentifier(container.init):
    case container.init.name !== localName:
      return false;

    default:
      return container.id.properties.every(function (prop) {
        // Non-computed property keys can be both an identifier
        // and a literal-value.  Only identifiers are supported.
        return t.isIdentifier(prop.key);
      });
  }
}

function getUsedPropKeys(t, localName, path) {
  var container = path.container;

  switch (true) {
    // Member access...
    case t.isMemberExpression(container) && !container.computed:
    case t.isJSXMemberExpression(container):
      return container.property.name;

    // Object destructuring assignment...
    case checkDestructure(t, localName, container):
      return container.id.properties.map(function(prop) {
        return prop.key.name;
      });

    // Anything else does not apply to this function.
    default:
      return void 0;
  }
}

function ImportDeclaration(t, path, state) {
  var node = path.node,
    scope = path.scope,
    opts = state.opts;

  if (!shouldTransform(node.source.value, opts)) {
    return;
  }

  node.specifiers = flatten(node.specifiers.map(function (spec) {
    if (!t.isImportNamespaceSpecifier(spec)) {
      return spec;
    }

    var localName = spec.local.name;

    if (!scope.hasBinding(localName)) {
      return spec;
    }

    if (scope.uids[localName]) {
      // Re-crawl the scope to resolve UIDs to proper bindings.
      scope.crawl();
    }

    var binding = scope.getBinding(localName);

    if (!binding) {
      return spec;
    }

    var usedPropKeys = binding.referencePaths.map(getUsedPropKeys.bind(null, t, localName)),
      noShadows = binding.constantViolations.length === 0;

    if (!noShadows || !usedPropKeys.every(Boolean)) {
      return spec;
    }

    var newSpecs = [],
      props = [],
      newIdents = Object.create(null);

    flatten(usedPropKeys).forEach(function (name) {
      if (newIdents[name]) {
        newIdent = newIdents[name];
      } else {
        newIdent = newIdents[name] = scope.generateUidIdentifier(name);
        newSpecs.push(
          t.importSpecifier(newIdent, t.identifier(name))
        );
        props.push(t.objectProperty(t.identifier(name), newIdent));
      }
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
    name: 'transform-resolve-wildcard-imports',
    visitor: {
      ImportDeclaration: ImportDeclaration.bind(null, babel.types)
    }
  }
}

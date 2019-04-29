function flatten(arr) {
  if (arr.length === 0) return arr;
  return Array.prototype.concat.apply([], arr);
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
      // Non-computed property keys can be both an identifier
      // and a literal-value.  Only identifiers are supported.
      return container.id.properties.every(p => t.isIdentifier(p.key));
  }
}

function extractUsedPropKeys(t, localName, path) {
  var container = path.container;

  switch (true) {
    // Member access...
    case t.isMemberExpression(container) && !container.computed:
    case t.isJSXMemberExpression(container):
      return container.property.name;

    // Object destructuring assignment...
    case checkDestructure(t, localName, container):
      return container.id.properties.map(p => p.key.name);

    // Anything else does not apply to this function.
    default:
      return void 0;
  }
}

function getUsedPropKeys(t, localName, scope) {
  if (!scope.hasBinding(localName)) return [];

  // Re-crawl the scope to resolve UIDs to proper bindings.
  if (scope.uids[localName]) scope.crawl();

  var binding = scope.getBinding(localName);

  if (!binding) return [];
  if (binding.constantViolations.length > 0) return [];

  var referencePaths = binding.referencePaths,
    len = referencePaths.length,
    result = [];

  for (var i = 0; i < len; i++) {
    var propKeys = extractUsedPropKeys(t, localName, referencePaths[i]);

    // Abort and return an empty array if `extractUsedPropKeys`
    // could not be applied to the input.
    if (propKeys == null) return [];

    result.push(propKeys);
  }

  return flatten(result);
}

function ImportDeclaration(t, path, state) {
  var node = path.node,
    scope = path.scope,
    opts = state.opts;

  if (!shouldTransform(node.source.value, opts)) {
    return;
  }

  node.specifiers = flatten(node.specifiers.map((spec) => {
    if (!t.isImportNamespaceSpecifier(spec)) return spec;

    var usedPropKeys = getUsedPropKeys(t, spec.local.name, scope);

    if (usedPropKeys.length === 0) return spec;

    var newSpecs = [],
      props = [],
      newIdents = Object.create(null);

    usedPropKeys.forEach((name) => {
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

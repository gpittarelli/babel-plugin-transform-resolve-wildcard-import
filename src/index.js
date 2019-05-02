var $pluginName = 'transform-resolve-wildcard-imports';

function flatten(arr) {
  if (arr.length === 0) return arr;
  return Array.prototype.concat.apply([], arr);
}

function isDecorated(node) {
  return node.decorators && node.decorators.length > 0;
}

function normalizeOptions(opts, recurse) {
  recurse = recurse == null || recurse;

  if (!opts) return [];
  if (typeof opts === 'object') {
    if (Array.isArray(opts)) return opts;
    if (Object.keys(opts).length === 0) return [];
    if (recurse && opts.only) return normalizeOptions(opts.only, false);
  }
  return [opts];
}

function shouldTransform(importName, whitelist) {
  if (whitelist.length === 0) return true;

  return whitelist.some(tester => {
    switch (true) {
      case tester instanceof RegExp:
        return tester.exec(importName);
      case typeof tester === 'function':
        return Boolean(tester(importName));
      default:
        return false;
    }
  });
}

function checkDestructure(t, localName, container) {
  switch (true) {
    case !t.isVariableDeclarator(container):
    case !t.isObjectPattern(container.id):
    case !t.isIdentifier(container.init):
    case container.init.name !== localName:
    // Decorators are not supported.
    case isDecorated(container.id):
      return false;

    default:
      return container.id.properties.every((prop) => {
        switch (true) {
          // Only property-based destructuring is supported.
          case !t.isObjectProperty(prop):
          // Non-computed property keys can be both an identifier
          // and a literal-value.  Only identifiers are supported.
          case !t.isIdentifier(prop.key):
          // Decorators are not supported.
          case isDecorated(prop):
          case isDecorated(prop.key):
          case isDecorated(prop.value):
            return false;
          default:
            return true;
        }
      });
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

function setupState() {
  this.set($pluginName, normalizeOptions(this.opts).map((opt, i) => {
    switch (true) {
      case typeof opt === 'string':
        return new RegExp(opt);
      case opt instanceof RegExp:
      case typeof opt === 'function':
        return opt;
      default:
        throw new Error(`[${$pluginName}] unsupported option provided to \`only\` at index ${i}`);
    }
  }));
}

function ImportDeclaration(t, path, state) {
  var node = path.node,
    scope = path.scope,
    whitelist = state.get($pluginName);

  if (!shouldTransform(node.source.value, whitelist)) return;

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
    name: $pluginName,
    pre: setupState,
    visitor: {
      ImportDeclaration: ImportDeclaration.bind(null, babel.types)
    }
  };
};

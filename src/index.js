const $pluginName = 'transform-resolve-wildcard-imports';

class UidMap {

  constructor(types, scope) {
    this._types = types;
    this._scope = scope;
    this._map = new Map();
  }

  get(id, alias) {
    const name = this._resolveName(id);
    if (!name) throw new Error(`cannot resolve a name from: ${id.toString()}`);

    let uid = this._map.get(name);
    if (uid) return uid;

    uid = this._resolveUid(name, this._resolveName(alias));
    this._map.set(name, uid);

    return uid;
  }

  hasConstantViolations(id) {
    const name = this._resolveName(id);
    if (!name) return false;

    const binding = this._scope.getBinding(name);
    return binding.constantViolations.length > 0;
  }

  getSpecifiers() {
    const result = [];

    for (const [name, uid] of this._map) {
      result.push(this._types.importSpecifier(
        this._types.identifier(uid),
        this._types.identifier(name)
      ));
    }

    return result;
  }

  _resolveName(id) {
    switch (true) {
      case typeof id === 'string':
        return id;
      case this._types.isIdentifier(id):
      case this._types.isJSXIdentifier(id):
        return id.name;
      default:
        return null;
    }
  }

  _resolveUid(name, alias) {
    if (alias) return alias;
    return this._scope.generateUid(name);
  }

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

function checkDestructure(t, localName, parent) {
  switch (true) {
    case !t.isVariableDeclarator(parent):
    case !t.isObjectPattern(parent.id):
    case !t.isIdentifier(parent.init):
    case parent.init.name !== localName:
    // Decorators are not supported.
    case isDecorated(parent.id):
      return false;

    default:
      return parent.id.properties.every((prop) => {
        switch (true) {
          // Only property-based destructuring is supported.
          case !t.isObjectProperty(prop):
          // Non-computed property keys can be both an identifier
          // and a literal-value.  Only identifiers are supported.
          case !t.isIdentifier(prop.key):
          // Default values are not supported.
          case t.isAssignmentPattern(prop.value):
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

const xforms = {
  MemberExpression(t, path, uidMap) {
    const uid = uidMap.get(path.node.property);
    path.replaceWith(t.identifier(uid));
  },
  JSXMemberExpression(t, path, uidMap) {
    const uid = uidMap.get(path.node.property);
    path.replaceWith(t.jSXIdentifier(uid));
  },
  VariableDeclarator(t, path, uidMap) {
    let varDeclarators = path.node.id.properties
      .map((prop) => {
        const { key, value } = prop;
        const hasViolation = uidMap.hasConstantViolations(value);
        const uid = uidMap.get(key, hasViolation ? null : value);

        switch (true) {
          case !t.isIdentifier(value):
          case uid !== value.name:
            return t.variableDeclarator(value, t.identifier(uid));
          default:
            return void 0;
        }
      })
      .filter(Boolean);

    const parent = path.parentPath;

    if (parent.node.declarations.length > 1) {
      path.remove();
      varDeclarators = varDeclarators.concat(parent.node.declarations);
    }

    if (varDeclarators.length > 0)
      parent.replaceWith(t.variableDeclaration(parent.node.kind, varDeclarators));
    else
      parent.remove();
  }
};

function bindTransform(t, localName, path, uidMap) {
  const parent = path.parent;

  switch (true) {
    // Member access...
    case t.isMemberExpression(parent) && !parent.computed:
      return xforms.MemberExpression.bind(null, t, path.parentPath, uidMap);
    
    // JSX member access...
    case t.isJSXMemberExpression(parent):
      return xforms.JSXMemberExpression.bind(null, t, path.parentPath, uidMap);

    // Object destructuring assignment...
    case checkDestructure(t, localName, parent):
      return xforms.VariableDeclarator.bind(null, t, path.parentPath, uidMap);
    
    // Anything else prevents transformation.
    default:
      return null;
  }
}

function tryDoTransforms(t, localName, scope, uidMap) {
  if (!scope.hasBinding(localName)) return false;

  // Re-crawl the scope to resolve UIDs to proper bindings.
  if (scope.uids[localName]) scope.crawl();

  const binding = scope.getBinding(localName);

  if (!binding) return false;
  if (binding.constantViolations.length > 0) return false;
  if (binding.referencePaths.length === 0) return false;

  const boundTransforms = [];
  for (const path of binding.referencePaths) {
    const fn = bindTransform(t, localName, path, uidMap);
    if (!fn) return false;
    boundTransforms.push(fn);
  }

  for (const fn of boundTransforms) fn();
  return true;
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

function ImportNamespaceSpecifier(t, specPath, state) {
  const { node: { local: { name } }, parent, scope } = specPath;
  const whitelist = state.get($pluginName);

  if (!t.isImportDeclaration(parent)) return;
  if (!shouldTransform(parent.source.value, whitelist)) return;

  const uidMap = new UidMap(t, scope);
  if (!tryDoTransforms(t, name, scope, uidMap)) return;
  
  const newSpecifiers = uidMap.getSpecifiers();
  if (newSpecifiers.length === 0) return;

  const importPath = specPath.parentPath;

  // Separate the new specifiers into their own declaration.
  // This allows other plugins the opportunity to perform additional
  // work on the transformed imports.
  importPath.insertAfter(t.importDeclaration(
    newSpecifiers, parent.source
  ));

  // Clean up; remove the original specifier and import declaration,
  // if it is no longer needed.
  specPath.remove();
  if (parent.specifiers.length === 0)
    importPath.remove();
}

module.exports = function resolveWildcardImports(api) {
  return {
    name: $pluginName,
    pre: setupState,
    visitor: {
      ImportNamespaceSpecifier: ImportNamespaceSpecifier.bind(null, api.types)
    }
  };
};

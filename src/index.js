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

function extractTransformFn(t, localName, path) {
  const parent = path.parent;

  switch (true) {
    // Member access...
    case t.isMemberExpression(parent) && !parent.computed:
      return xforms.MemberExpression.bind(null, t, path.parentPath);
    
    // JSX member access...
    case t.isJSXMemberExpression(parent):
      return xforms.JSXMemberExpression.bind(null, t, path.parentPath);

    // Object destructuring assignment...
    case checkDestructure(t, localName, parent):
      return xforms.VariableDeclarator.bind(null, t, path.parentPath);

    // Anything else does not apply to this function.
    default:
      return void 0;
  }
}

function getTransforms(t, localName, scope) {
  if (!scope.hasBinding(localName)) return [];

  // Re-crawl the scope to resolve UIDs to proper bindings.
  if (scope.uids[localName]) scope.crawl();

  const binding = scope.getBinding(localName);

  if (!binding) return [];
  if (binding.constantViolations.length > 0) return [];

  const referencePaths = binding.referencePaths,
    len = referencePaths.length,
    result = [];

  for (let i = 0; i < len; i++) {
    const xformFn = extractTransformFn(t, localName, referencePaths[i]);

    // Abort and return an empty array if `extractUsedPropKeys`
    // could not be applied to the input.
    if (xformFn == null) return [];

    result.push(xformFn);
  }

  return result;
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

function ImportDeclaration(t, supportsESM, path, state) {
  const { node, scope } = path;
  const whitelist = state.get($pluginName);

  if (!shouldTransform(node.source.value, whitelist)) return;

  node.specifiers = flatten(node.specifiers.map((spec) => {
    if (!t.isImportNamespaceSpecifier(spec)) return spec;

    const transformations = getTransforms(t, spec.local.name, scope);
    if (transformations.length === 0) return spec;

    const uidMap = new UidMap(t, scope);
    transformations.forEach(xformFn => xformFn(uidMap));

    return uidMap.getSpecifiers();
  }));
}

function supportsESM(api) {
  if (typeof api.caller !== 'function') return false;
  return api.caller(caller => Boolean(caller && caller.supportsStaticESM));
}

module.exports = function resolveWildcardImports(api) {
  return {
    name: $pluginName,
    pre: setupState,
    visitor: {
      ImportDeclaration: ImportDeclaration.bind(null, api.types, supportsESM(api))
    }
  };
};

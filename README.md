# babel-plugin-transform-resolve-wildcard-import

Transforms wildcard style imports:

```javascript
    import * as x from 'y';
    import * as w from 'z';
    x.a();
    x.b();
    console.log(Object.values(w));
```

into member style imports:

```javascript
    import {a, b} from 'y';
    import * as w from 'z';
    a();
    b();
    console.log(Object.values(w));
```

(well, that would be ideal, but actually it looks more like the
following, which is a bit simpler to implement:)

```javascript
    import {a as _a, b as _b} from 'y';
    import * as w from 'z';
    var x = {a: _a, b: _b};
    x.a();
    x.b();
    console.log(Object.values(w));
```

This is useful in some situations to get webpack and similar tools to
tree-shake better.

Note: This plugin only works when the wildcard import (`x` in the
example) is only ever used in a property access. If you use `x`
directly, then we leave the wildcard import in place.

# babel-plugin-transform-resolve-wildcard-import

Transforms wildcard style imports:

```javascript
import * as x from 'y';
import * as w from 'z';
x.a();
x.b();
console.log(Object.values(w));
```

Into member style imports:

```javascript
import { a, b } from 'y';
import * as w from 'z';
a();
b();
console.log(Object.values(w));
```

This is useful in some situations to get Webpack and similar tools to
tree-shake better.

## Supported Transformations

### Simple Property Access

This plugin can transform simple property access on the imported
object into named-imports.

Input:

```javascript
import * as x from 'y';
x.a();
x.b();
```

Equivalent output:

```javascript
import { a, b } from 'y';
a();
b();
```

### JSX Property Access

This plugin can transform property access on the imported object, when
used as tags for JSX elements, into named-imports.

Input:

```javascript
import * as x from 'y';
<x.A>Here is a text block. <x.B /></x.A>;
```

Equivalent output:

```javascript
import { A, B } from 'y';
<A>Here is a text block. <B /></A>;
```

### Destructuring Variable Declaration

This plugin can transform variable declarations via object destructuring,
including nested patterns, into named-imports.

Input:

```javascript
import * as x from 'y';
const { a, b: { ['c']: see } } = x;
a();
see();
```

Equivalent output:

```javascript
import { a, b as _b } from 'y';
const { ['c']: see } = _b;
a();
see();
```

This only supports destructuring properties from the imported object using
identifiers; it will not transform if a literal or computed property is used,
nor any other kind of pattern, such as the object-spread pattern or the array
pattern.

See the de-optimization cases below for more information.

## De-optimizations

### Direct Usage of the Imported Object

This plugin will not transform an import if the imported object is used in any
other way besides accessing its properties.

Example:

```javascript
import * as x from 'y';
x.a();
console.dir(x);  // De-opt here!
```

### Reassigning the Variable of the Imported Object

This plugin will not transform an import if the variable containing the
imported object is reassigned at any point.

Example:

```javascript
import * as x from 'y';
x.a();
x = {};  // De-opt here!
```

### Literal and Computed Property Access

This plugin will not transform an import if a property of the imported object
is accessed using bracket-syntax.

Example:

```javascript
import * as x from 'y';
x.a();
x['b']();  // De-opt here!
```

### Destructuring with Property Patterns providing Default Values

This plugin will not transform an import if a default value is provided in
an object-property pattern of a destructuring variable declaration.

Example:

```javascript
import * as x from 'y';
const {
    a, b,
    c = Math.random  // De-opt here!
} = x;
a();
b();
c();
```

Note: This restriction does not apply to nested patterns.

### Destructuring with Literal and Computed Property Patterns

This plugin will not transform an import if a literal or computed value is used
in an object-property pattern of a destructuring variable declaration.

Example:

```javascript
import * as x from 'y';
const key = 'c';
const {
    a, b,
    [key]: see  // De-opt here!
} = x;
a();
b();
see();
```

Note: This restriction does not apply to nested patterns.

### Destructuring with Non-Property Patterns

This plugin will not transform an import if the object-spread pattern, the
array pattern, or any other type of non-property pattern are used in a
destructuring variable declaration.

Example with Object-Spread Pattern:

```javascript
import * as x from 'y';
const {
    a, b,
    ...rest  // De-opt here!
} = x;
a();
b();
rest.c();
```

Example with Array Pattern:

```javascript
import * as x from 'y';
const [a, b] = x;  // De-opt here!
a();
b();
```

Note: This restriction does not apply to nested patterns.

## Options

By default this will apply to all wildcard imports; for example, with a
.babelrc like:

```json
{
    "plugins": ["babel-plugin-transform-resolve-wildcard-import"]
}
```

If you only want it to apply this to certain import paths you can
restrict the transforms with an array of regular-expression patterns
passed as `only`:

```json
{
    "plugins": [
        ["babel-plugin-transform-resolve-wildcard-import", { "only": [
            "^lodash$",
            "^\\.\\.?\/UI(\/(index(\\.js)?)?)?$"
        ]}]
    ]
}
```

If you are using Babel's programmatic options or Babel 7's JavaScript
configuration files, real regular-expressions and functions can also
be used with `only`:

```javascript
var mm = require("micromatch");

module.exports = {
    plugins: [
        ["babel-plugin-transform-resolve-wildcard-import", { only: [
            /^lodash$/i,
            (name) => name.startsWith("lib/"),
            mm.matcher("**/UI/index?(.js)")
        ]}]
    ]
};
```
var babel = require('babel-core');
var assert = require('assert');

function transform(code) {
  return babel.transform(code, {
    babelrc: false,
    plugins: [require('../')]
  }).code;
}

describe('wildcard import transformations', function() {
  it('should handle basic wildcard case', function() {
    var orig = "import * as x from 'y';x.a();x.b();x.c.d();";

    assert.equal(
      transform(orig),
      "import { a as _a, b as _b, c as _c } from 'y';var x = {\n" +
        "  a: _a,\n" +
        "  b: _b,\n" +
        "  c: _c\n" +
        "};\n" +
        "x.a();x.b();x.c.d();"
    );
  });

  it('should not transform if any non-property usages', function() {
    var orig = "import * as x from 'y';var a = 'a';x[a]();",
      out = transform(orig);

    assert.equal(orig, out);
  });

  it('should not transform in the prescence of shadowing', function() {
    var orig = "import * as x from 'y';x.a();x = {};x.b();x.c.d();";

    assert.equal(
      transform(orig),
      orig // "import { a as _a } from 'y';_a(); x = {};x.b();x.c.d();"
    );
  });
});

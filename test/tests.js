var babel = require('babel-core');
var assert = require('assert');
var plugin = require('../');

function transform(code, opts) {

  return babel.transform(code, {
    babelrc: false,
    plugins: [opts ? [plugin, opts] : plugin],
    parserOpts: {
      plugins: ['*']
    }
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

  it('should transform in the prescence of JSX member expressions', function() {
    var orig = "import * as x from 'y';<x.A></x.A>";

    assert.equal(
      transform(orig),
      "import { A as _A } from 'y';var x = {\n" +
      "  A: _A\n" +
      "};\n" +
      "<x.A></x.A>;"
    );
  });

  it('should not transform unspecified imports', function() {
    var orig = "import * as x from 'y';<x.A></x.A>;";

    assert.equal(transform(orig, {only: ['x']}), orig);
  });

  it('accepts single string \'only\' option', function() {
    var orig = "import * as x from 'y';<x.A></x.A>;";

    assert.equal(transform(orig, {only: 'x'}), orig);
  });

  it('should transform specified imports', function() {
    var orig = "import * as x from 'y';<x.A></x.A>;";

    assert.equal(
      transform(orig, ['y']),
      "import { A as _A } from 'y';var x = {\n" +
      "  A: _A\n" +
      "};\n" +
      "<x.A></x.A>;"
    );
  });
});

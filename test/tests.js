var path = require('path');
var babel = require('babel-core');
var pluginTester = require('babel-plugin-tester');
var plugin = require('../');

// Creates a test using the JSX syntax.
function jsxTest(includeOutput, mixin) {
  return Object.assign(
    {
      code: `
        import * as x from 'y';
        <x.A></x.A>;
      `
    },
    !includeOutput ? null : {
      output: `
        import { A as _A } from 'y';
        <_A></_A>;
      `
    },
    mixin
  );
}

pluginTester({
  plugin, babel,
  babelOptions: {
    babelrc: true,
    filename: path.join(__dirname, 'fixture.js'),
    sourceRoot: __dirname
  },
  formatResult: (result) => {
    // Remove no-content lines from the result.
    return result
      .split('\n')
      .filter(line => Boolean(line.trim()))
      .join('\n');
  },
  tests: {
    'should handle basic wildcard case': {
      code: `
        import * as x from 'y';
        x.a();
        x.b();
        x.c.d();
      `,
      output: `
        import { a as _a, b as _b, c as _c } from 'y';
        _a();
        _b();
        _c.d();
      `,
    },

    'should handle complex wildcard case': {
      code: `
        import defaultExport, * as x from 'y';
        x.a();
        x.b();
        x.c.d();
        defaultExport();
      `,
      output: `
        import defaultExport from 'y';
        import { a as _a, b as _b, c as _c } from 'y';
        _a();
        _b();
        _c.d();
        defaultExport();
      `,
    },

    'should not transform when bracketed property access syntax is used': {
      code: `
        import * as x from 'y';
        var a = 'a';
        x[a]();
      `,
    },

    'should not transform in the case of direct usage': {
      code: `
        import * as x from 'y';
        console.log(Object.keys(x));
      `,
    },

    'should not transform in the presence of shadowing': {
      code: `
        import * as x from 'y';
        x.a();
        x = {};
        x.b();
        x.c.d();
      `,
    },

    'should transform in the presence of JSX member expressions': jsxTest(true, {
      // Intentionally empty.
    }),

    'should not transform unspecified imports, by string': jsxTest(false, {
      pluginOptions: { only: ['x'] },
    }),

    'should not transform unspecified imports, by regular-expression': jsxTest(false, {
      pluginOptions: { only: [/^x$/] },
    }),

    'should not transform unspecified imports, by function': jsxTest(false, {
      pluginOptions: { only: [(name) => name === 'x'] },
    }),

    'should transform specified imports, by string': jsxTest(true, {
      pluginOptions: ['y'],
    }),

    'should transform specified imports, by regular-expression': jsxTest(true, {
      pluginOptions: [/^y$/],
    }),

    'should transform specified imports, by function': jsxTest(true, {
      pluginOptions: [(name) => name !== 'x'],
    }),

    'should accept non-array `only` option': jsxTest(false, {
      pluginOptions: { only: 'x' },
    }),

    'should reject unsupported values supplied to `only` option': jsxTest(false, {
      pluginOptions: { only: [/^y$/, {}] },
      error: '[transform-resolve-wildcard-imports] unsupported option provided to `only` at index 1'
    }),

    'should not fail when used with `transform-export-extensions`': {
      code: `export * as x from 'y';`,
      output: `
        import * as _x from 'y';
        export { _x as x };
      `,
    },

    'should transform from destructuring assignments, basic usage': {
      code: `
        import * as x from 'y';
        var { a, b, c: see } = x;
      `,
      output: `
        import { a, b, c as see } from 'y';
      `,
    },

    'should transform from destructuring assignments, complex usage': {
      code: `
        import * as x from 'y';
        x.c();
        var { a, b, c: see } = x;
      `,
      output: `
        import { c as _c, a, b } from 'y';
        _c();
        var see = _c;
      `,
    },

    'should transform from destructuring assignments, constant violation': {
      code: `
        import * as x from 'y';
        var { a, b, c: see } = x;
        see = {};
      `,
      output: `
        import { a, b, c as _c } from 'y';
        var see = _c;
        see = {};
      `,
    },

    'should transform from destructuring assignments, nested usage': {
      code: `
        import * as x from 'y';
        var { a, b: { t, ['u']: you }, c: { v: vee } } = x;
      `,
      output: `
        import { a, b as _b, c as _c } from 'y';
        var { t, ['u']: you } = _b,
            { v: vee } = _c;
      `,
    },

    'should transform from duplicated destructuring assignments, assigned intermediate': {
      code: `
        import * as x from 'y';
        var { a, b } = x;
        var { b: { t, u } } = x;
        var { b: { v } } = x;
      `,
      output: `
        import { a, b } from 'y';
        var { t, u } = b;
        var { v } = b;
      `,
    },

    'should transform from duplicated destructuring assignments, unassigned intermediate': {
      code: `
        import * as x from 'y';
        var { a, b: { t, u } } = x;
        var { b: { v } } = x;
      `,
      output: `
        import { a, b as _b } from 'y';
        var { t, u } = _b;
        var { v } = _b;
      `,
    },

    'should transform from duplicated destructuring assignments, alternative identifier': {
      code: `
        import * as x from 'y';
        var { a, b } = x;
        var { b: bee } = x;
      `,
      output: `
        import { a, b } from 'y';
        var bee = b;
      `,
    },

    'should not transform from destructuring assignments with literal properties': {
      code: `
        import * as x from 'y';
        var { ['1a']: a, b, c } = x;
      `,
    },

    'should not transform from destructuring assignments with computed properties': {
      code: `
        import * as x from 'y';
        var { ['A'.toLowerCase()]: a, b, c } = x;
      `,
    },

    'should not transform from destructuring assignments with default values': {
      code: `
        import * as x from 'y';
        var { a, b, c = 'see' } = x;
      `,
    },

    'should not transform from destructuring assignments with object-spread pattern': {
      babelOptions: {
        parserOpts: {
          plugins: ['objectRestSpread']
        }
      },
      code: `
        import * as x from 'y';
        var { a, b, ...rest } = x;
      `,
    },

    'should not transform from destructuring assignments with array pattern': {
      code: `
        import * as x from 'y';
        var [a, b] = x;
      `,
    },

    'should not transform when a de-opt occurs after a successful transform': {
      code: `
        import * as x from 'y';
        var { a, b: { t, ['u']: you } } = x;
        var [c, d] = x;
      `,
    }
  }
});

var path = require('path');
var babel = require('babel-core');
var pluginTester = require('babel-plugin-tester');
var plugin = require('../');

pluginTester({
  plugin, babel,
  babelOptions: {
    babelrc: true,
    filename: path.join(__dirname, 'fixture.js'),
    sourceRoot: __dirname
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
        var x = {
          a: _a,
          b: _b,
          c: _c
        };
        x.a();
        x.b();
        x.c.d();
      `,
    },

    'should not transform if any non-property usages': {
      code: `
        import * as x from 'y';
        var a = 'a';
        x[a]();
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

    'should transform in the presence of JSX member expressions': {
      code: `
        import * as x from 'y';
        <x.A></x.A>;
      `,
      output: `
        import { A as _A } from 'y';
        var x = {
          A: _A
        };
        <x.A></x.A>;
      `,
    },

    'should not transform unspecified imports': {
      pluginOptions: { only: ['x'] },
      code: `
        import * as x from 'y';
        <x.A></x.A>;
      `,
    },

    'accepts single string `only` option': {
      pluginOptions: { only: 'x' },
      code: `
        import * as x from 'y';
        <x.A></x.A>;
      `,
    },

    'should transform specified imports': {
      pluginOptions: ['y'],
      code: `
        import * as x from 'y';
        <x.A></x.A>;
      `,
      output: `
        import { A as _A } from 'y';
        var x = {
          A: _A
        };
        <x.A></x.A>;
      `,
    },

    'should not fail when used with `transform-export-extensions`': {
      code: `export * as x from 'y';`,
      output: `
        import * as _x from 'y';
        export { _x as x };
      `,
    },

    'should transform from destructuring assignments': {
      code: `
        import * as x from 'y';
        var { a, b, c } = x;
      `,
      output: `
        import { a as _a, b as _b, c as _c } from 'y';
        var x = {
          a: _a,
          b: _b,
          c: _c
        };
        var a = x.a,
            b = x.b,
            c = x.c;
      `,
    },

    'should not transform from destructuring assignments with literal properties': {
      code: `
        import * as x from 'y';
        var { ['1a']: a, b, c } = x;
      `,
      output: `
        import * as x from 'y';
        var a = x['1a'],
            b = x.b,
            c = x.c;
      `,
    },

    'should not transform from destructuring assignments with computed properties': {
      code: `
        import * as x from 'y';
        var { ['A'.toLowerCase()]: a, b, c } = x;
      `,
      output: `
        import * as x from 'y';
        var a = x['A'.toLowerCase()],
            b = x.b,
            c = x.c;
      `,
    }
  }
});

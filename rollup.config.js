import sucrase from '@rollup/plugin-sucrase';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';

export default {
  input: 'lib/FakeCouch.ts',
  output: {
    name: 'fakecouch',
    file: 'dist/fakecouch.js',
    format: 'cjs',
    sourcemap: true,
    compact: true,
  },
  plugins: [
    resolve({
      extensions: ['.js', '.json', '.ts'],
    }),
    sucrase({
      exclude: ['node_modules/**'],
      transforms: ['typescript'],
    }),
    terser(),
  ],
  onwarn(message) {},
};

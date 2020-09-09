import sucrase from '@rollup/plugin-sucrase';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'lib/FakeCouch.ts',
  output: {
    file: 'dist/fakecouch.js',
    format: 'es',
    name: 'api-server'
  },
  plugins: [
    resolve({
      extensions: ['.js', '.ts']
    }),
    sucrase({
      exclude: ['node_modules/**'],
      transforms: ['typescript']
    })
  ]
};

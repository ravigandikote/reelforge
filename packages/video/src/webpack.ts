import type { WebpackOverrideFn } from '@remotion/bundler'

/**
 * The workspace packages use ESM-correct '.js' specifiers that point at '.ts'
 * and '.tsx' sources. Remotion's webpack needs telling to follow them, the same
 * way the Next app does.
 */
export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      ...config.resolve?.extensionAlias,
      '.js': ['.tsx', '.ts', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    },
  },
})

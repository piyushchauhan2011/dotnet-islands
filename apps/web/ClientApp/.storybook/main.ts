import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'

const config = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  staticDirs: ['../../wwwroot'],
  viteFinal: async (viteConfig) => {
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: {
        ...(typeof viteConfig.resolve?.alias === 'object' &&
        !Array.isArray(viteConfig.resolve.alias)
          ? viteConfig.resolve.alias
          : {}),
        '#': fileURLToPath(new URL('../src', import.meta.url)),
        '@': fileURLToPath(new URL('../src', import.meta.url)),
      },
    }
    return viteConfig
  },
} satisfies StorybookConfig

export default config

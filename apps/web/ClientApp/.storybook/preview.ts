import type { Preview } from '@storybook/react-vite'

import '../src/styles.scss'

document.documentElement.dataset.theme = 'light'

const preview = {
  parameters: {
    backgrounds: {
      options: {
        warm_canvas: { name: 'Warm canvas', value: '#f6f3ea' },
        white: { name: 'White', value: '#ffffff' },
        woodland: { name: 'Woodland', value: '#2f3a2f' },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'error',
    },
  },

  initialGlobals: {
    backgrounds: {
      value: 'warm_canvas',
    },
  },
} satisfies Preview

export default preview

const origin = (process.env.LIGHTHOUSE_ORIGIN || 'http://127.0.0.1:5000').replace(/\/$/, '')

module.exports = {
  ci: {
    collect: {
      url: [
        `${origin}/`,
        `${origin}/destinations/amalfi-coast`,
        `${origin}/hotels/casa-aurelia`,
        `${origin}/blog/the-art-of-the-unhurried-arrival`,
      ],
      numberOfRuns: 1,
      settings: { preset: 'desktop' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 1 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
}

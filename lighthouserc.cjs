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
      numberOfRuns: 3,
      settings: { preset: 'desktop' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9, aggregationMethod: 'median-run' }],
        'categories:accessibility': ['error', { minScore: 1, aggregationMethod: 'median-run' }],
        'categories:best-practices': ['error', { minScore: 1, aggregationMethod: 'median-run' }],
        'categories:seo': ['error', { minScore: 1, aggregationMethod: 'median-run' }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median-run' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median-run' }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
}

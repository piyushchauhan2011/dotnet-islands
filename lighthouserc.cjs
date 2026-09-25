module.exports = {
  ci: {
    collect: {
      url: [
        'http://127.0.0.1:5000/',
        'http://127.0.0.1:5000/destinations/amalfi-coast',
        'http://127.0.0.1:5000/hotels/casa-aurelia',
        'http://127.0.0.1:5000/blog/the-art-of-the-unhurried-arrival',
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

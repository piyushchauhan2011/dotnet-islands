const desktop = require('./lighthouserc.cjs')

// Lighthouse's version-pinned defaults supply mobile screen and simulated
// network/CPU throttling. Do not inherit the desktop preset or score gates.
module.exports = {
  ci: {
    collect: {
      url: desktop.ci.collect.url,
      numberOfRuns: desktop.ci.collect.numberOfRuns,
      settings: { formFactor: 'mobile', throttlingMethod: 'simulate' },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
}

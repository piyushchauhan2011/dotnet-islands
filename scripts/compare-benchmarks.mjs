#!/usr/bin/env node
import { createHash } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

const entryKeys = {
  public: 'src/islands/runtime.tsx',
  admin: 'src/admin/main.tsx',
}
const routes = [
  '/',
  '/destinations/amalfi-coast',
  '/hotels/casa-aurelia',
  '/blog/the-art-of-the-unhurried-arrival',
]
const scopeNames = [
  'publicEntryFile',
  'adminEntryFile',
  'publicStatic',
  'adminStatic',
  'publicFull',
  'adminFull',
  'sharedStatic',
  'combinedStatic',
  'sharedFull',
  'combinedFull',
]
const byteMetrics = ['rawBytes', 'gzipBytes', 'brotliBytes']
const categories = ['performance', 'accessibility', 'best-practices', 'seo']
const auditNames = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'speed-index',
  'total-blocking-time',
  'cumulative-layout-shift',
  'total-byte-weight',
  'bootup-time',
  'mainthread-work-breakdown',
]
const fail = (message) => {
  throw new Error(message)
}
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const isHash = (value) =>
  typeof value === 'string' && /^[a-f\d]{64}$/.test(value)
const number = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    fail(`Invalid numeric metric: ${label}`)
  return value
}
const integer = (value, label) => {
  number(value, label)
  if (!Number.isSafeInteger(value)) fail(`Invalid integer: ${label}`)
  return value
}
const text = (value, label) => {
  if (typeof value !== 'string' || !value) fail(`Missing ${label}`)
  return value
}
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (object(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stable(value[key]))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
function equal(before, after, label) {
  if (stable(before) !== stable(after))
    fail(`Unequal ${label}; cannot compare different experiment inputs`)
}
function args(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    if (
      !['--before', '--after', '--output'].includes(flag) ||
      Object.hasOwn(result, flag) ||
      !argv[index + 1] ||
      argv[index + 1].startsWith('--')
    ) {
      fail(
        'Usage: compare-benchmarks.mjs --before <directory> --after <directory> --output <empty-directory>',
      )
    }
    result[flag] = path.resolve(argv[index + 1])
  }
  if (Object.keys(result).length !== 3)
    fail('Missing --before, --after or --output')
  return result
}
async function json(filename) {
  const bytes = await readFile(filename)
  try {
    return { value: JSON.parse(bytes.toString('utf8')), sha256: hash(bytes) }
  } catch {
    fail(`Invalid JSON report: ${path.basename(filename)}`)
  }
}
function safeRelative(filename) {
  if (
    typeof filename !== 'string' ||
    !filename ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    filename.startsWith('/') ||
    filename
      .split('/')
      .some((part) => !part || part === '.' || part === '..') ||
    /^[a-z][a-z\d+.-]*:/i.test(filename)
  )
    fail('Invalid artifact-relative file path')
  return filename
}
async function artifactFile(directory, filename) {
  const resolved = await realpath(path.join(directory, safeRelative(filename)))
  if (
    !resolved.startsWith(directory + path.sep) ||
    !(await stat(resolved)).isFile()
  )
    fail('Artifact is not a contained regular file')
  return resolved
}
function statistics(values) {
  const available = values
    .filter((value) => value !== null)
    .sort((a, b) => a - b)
  const middle = Math.floor(available.length / 2)
  return {
    sampleCount: values.length,
    availableCount: available.length,
    missingCount: values.length - available.length,
    median: available.length
      ? available.length % 2
        ? available[middle]
        : (available[middle - 1] + available[middle]) / 2
      : null,
    min: available.length ? available[0] : null,
    max: available.length ? available.at(-1) : null,
  }
}
function delta(before, after) {
  return {
    absolute: before === null || after === null ? null : after - before,
    percentage:
      before === null || after === null || before === 0
        ? null
        : ((after - before) / before) * 100,
  }
}
function compareValues(before, after) {
  const left = statistics(before)
  const right = statistics(after)
  return {
    before: left,
    after: right,
    delta: Object.fromEntries(
      ['median', 'min', 'max'].map((metric) => [
        metric,
        delta(left[metric], right[metric]),
      ]),
    ),
  }
}
function flattenMetrics(value, prefix = '', result = {}) {
  if (!object(value) || Object.keys(value).length === 0)
    fail('Journey metrics must be nonempty nested objects of numbers or null')
  for (const [key, item] of Object.entries(value)) {
    if (!key || key.includes('.')) fail('Invalid journey metric name')
    const name = prefix ? `${prefix}.${key}` : key
    if (object(item)) flattenMetrics(item, name, result)
    else result[name] = item === null ? null : number(item, name)
  }
  return result
}
function checkUrl(raw, label) {
  let url
  try {
    url = new URL(text(raw, label))
  } catch {
    fail(`Invalid ${label}`)
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    fail(`Unsupported or credential-bearing ${label}`)
  for (const key of url.searchParams.keys()) {
    if (/token|password|secret|authorization|api.?key/i.test(key))
      fail(`Sensitive query in ${label}`)
  }
  return url
}
function rejectSecrets(value) {
  if (Array.isArray(value)) {
    for (const item of value) rejectSecrets(item)
  } else if (object(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (
        /^(?:.*password|.*token|secret|authorization|cookie|storageState)$/i.test(
          key,
        ) &&
        item !== null &&
        item !== ''
      )
        fail('Sensitive credential fields cannot be retained in artifacts')
      rejectSecrets(item)
    }
  }
}

async function loadBundles(directory) {
  const loaded = await json(await artifactFile(directory, 'bundles.json'))
  const bundle = loaded.value
  if (
    !object(bundle) ||
    bundle.schemaVersion !== 1 ||
    !Array.isArray(bundle.files) ||
    !object(bundle.scopes)
  )
    fail('Malformed bundle report')
  equal(bundle.entryKeys, entryKeys, 'bundle entry keys')
  equal(bundle.compression?.gzipLevel, 9, 'gzip level')
  equal(bundle.compression?.brotliQuality, 11, 'Brotli quality')
  equal(bundle.compression?.synthetic, true, 'synthetic size declaration')
  if (!isHash(bundle.manifestSha256) || !isHash(bundle.lockfileSha256))
    fail('Missing bundle manifest/lockfile SHA-256')
  text(bundle.sourceRevision, 'bundle source revision')
  const manifestBytes = await readFile(
    await artifactFile(directory, 'manifest.json'),
  )
  if (hash(manifestBytes) !== bundle.manifestSha256)
    fail('Saved manifest hash does not match bundle report')
  let manifest
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    fail('Saved manifest is malformed')
  }
  const files = new Map()
  for (const file of bundle.files) {
    if (
      !object(file) ||
      !['js', 'css', 'other'].includes(file.kind) ||
      !isHash(file.sha256)
    )
      fail('Malformed bundle file measurement')
    safeRelative(file.path)
    if (files.has(file.path)) fail('Duplicate bundle file measurement')
    equal(
      file.kind,
      /\.m?js$/i.test(file.path)
        ? 'js'
        : /\.css$/i.test(file.path)
          ? 'css'
          : 'other',
      'bundle file classification',
    )
    for (const metric of byteMetrics) integer(file[metric], metric)
    files.set(file.path, file)
  }
  const expectedClosure = (key, dynamic) => {
    const visited = new Set()
    const result = new Set()
    function visit(id) {
      if (visited.has(id)) return
      visited.add(id)
      if (
        !object(manifest) ||
        !Object.hasOwn(manifest, id) ||
        !object(manifest[id])
      )
        fail('Missing saved manifest dependency')
      const entry = manifest[id]
      result.add(safeRelative(entry.file))
      for (const field of ['imports', 'dynamicImports', 'css', 'assets']) {
        if (
          entry[field] !== undefined &&
          (!Array.isArray(entry[field]) ||
            entry[field].some((item) => typeof item !== 'string' || !item))
        )
          fail('Malformed saved manifest dependency list')
      }
      for (const file of [...(entry.css ?? []), ...(entry.assets ?? [])])
        result.add(safeRelative(file))
      for (const id of entry.imports ?? []) visit(id)
      if (dynamic) for (const id of entry.dynamicImports ?? []) visit(id)
    }
    visit(key)
    if (key === entryKeys.public && manifest['src/styles.scss'])
      visit('src/styles.scss')
    return result
  }
  const expected = {}
  for (const [name, key] of Object.entries(entryKeys)) {
    if (manifest?.[key]?.isEntry !== true)
      fail('Saved manifest lacks required entry')
    expected[`${name}EntryFile`] = new Set([manifest[key].file])
    expected[`${name}Static`] = expectedClosure(key, false)
    expected[`${name}Full`] = expectedClosure(key, true)
  }
  for (const suffix of ['Static', 'Full']) {
    expected[`shared${suffix}`] = new Set(
      [...expected[`public${suffix}`]].filter((file) =>
        expected[`admin${suffix}`].has(file),
      ),
    )
    expected[`combined${suffix}`] = new Set([
      ...expected[`public${suffix}`],
      ...expected[`admin${suffix}`],
    ])
  }
  equal(
    [...files.keys()].sort(),
    [...expected.combinedFull].sort(),
    'bundle file inventory',
  )
  equal(
    Object.keys(bundle.scopes).sort(),
    [...scopeNames].sort(),
    'bundle scope names',
  )
  for (const name of scopeNames) {
    const scope = bundle.scopes[name]
    if (!object(scope) || !Array.isArray(scope.files) || !object(scope.totals))
      fail(`Malformed bundle scope: ${name}`)
    equal(
      [...scope.files].sort(),
      [...expected[name]].sort(),
      `bundle ${name} closure`,
    )
    for (const kind of ['js', 'css', 'other', 'all']) {
      const selected = scope.files
        .map((file) => files.get(file))
        .filter((file) => kind === 'all' || file.kind === kind)
      const totals = scope.totals[kind]
      if (!object(totals)) fail('Missing bundle totals')
      equal(totals.count, selected.length, `bundle ${name}/${kind} file count`)
      for (const metric of byteMetrics)
        equal(
          totals[metric],
          selected.reduce((sum, file) => sum + file[metric], 0),
          `bundle ${name}/${kind}/${metric}`,
        )
    }
  }
  return { ...loaded, manifest }
}

async function loadJourneys(directory, bundle) {
  const loaded = await json(await artifactFile(directory, 'journeys.json'))
  const report = loaded.value
  if (
    !object(report) ||
    report.schemaVersion !== 1 ||
    !object(report.inputs) ||
    !object(report.environment) ||
    !Array.isArray(report.samples)
  )
    fail('Malformed journey report')
  rejectSecrets(report)
  const inputs = report.inputs
  const origin = checkUrl(inputs.origin, 'journey origin')
  if (origin.origin !== inputs.origin || inputs.protocol !== origin.protocol)
    fail('Journey origin/protocol mismatch')
  integer(inputs.runs, 'journey run count')
  if (inputs.runs < 1) fail('Journey run count must be positive')
  if (!object(inputs.browser)) fail('Missing journey browser inputs')
  for (const key of ['name', 'version', 'executable'])
    text(inputs.browser[key], `journey browser ${key}`)
  equal(inputs.browser.name, 'chromium', 'journey browser engine')
  if (
    !object(inputs.instrumentation) ||
    !Array.isArray(inputs.profiles) ||
    !Array.isArray(inputs.journeys) ||
    !Array.isArray(inputs.omissions)
  )
    fail('Missing journey profile/protocol/omission inputs')
  const profiles = new Set()
  for (const profile of inputs.profiles) {
    text(profile.id, 'profile ID')
    if (profiles.has(profile.id)) fail('Duplicate journey profile')
    if (
      !object(profile.viewport) ||
      !['desktop', 'mobile'].includes(profile.id)
    )
      fail('Malformed journey viewport/profile')
    const mobile = profile.id === 'mobile'
    equal(
      profile.viewport,
      mobile ? { width: 390, height: 844 } : { width: 1568, height: 900 },
      'fixed journey viewport',
    )
    equal(profile.isMobile, mobile, 'fixed mobile emulation')
    equal(profile.hasTouch, mobile, 'fixed touch emulation')
    equal(profile.cpuSlowdown, mobile ? 4 : 1, 'fixed CPU slowdown')
    equal(
      profile.network,
      mobile
        ? {
            latency: 150,
            downloadThroughput: 1600000 / 8,
            uploadThroughput: 750000 / 8,
          }
        : null,
      'fixed laboratory network',
    )
    profiles.add(profile.id)
  }
  if (
    profiles.size !== 2 ||
    !profiles.has('desktop') ||
    !profiles.has('mobile')
  )
    fail('Both fixed desktop/mobile journey profiles are required')
  const expected = new Map()
  const journeyIds = new Set()
  for (const journey of inputs.journeys) {
    text(journey.id, 'journey ID')
    text(journey.route, 'journey route')
    if (
      journeyIds.has(journey.id) ||
      !Array.isArray(journey.profiles) ||
      !journey.profiles.length
    )
      fail('Malformed/duplicate journey definition')
    journeyIds.add(journey.id)
    equal(
      journey.profiles,
      journey.route === '/' ? ['mobile'] : ['desktop', 'mobile'],
      'applicable journey profiles',
    )
    for (const profile of journey.profiles) {
      const key = `${journey.id}/${profile}`
      if (!profiles.has(profile) || expected.has(key))
        fail('Unknown/duplicate applicable journey profile')
      expected.set(key, [])
    }
    for (const profile of profiles) {
      if (
        !journey.profiles.includes(profile) &&
        !inputs.omissions.some(
          (item) =>
            item.journey === journey.id &&
            item.profile === profile &&
            typeof item.reason === 'string' &&
            item.reason,
        )
      ) {
        fail('Inapplicable journey profile needs an explicit omission reason')
      }
    }
  }
  if (journeyIds.size !== 5) fail('All five fixed journeys are required')
  equal(
    inputs.journeys.map((journey) => journey.route).sort(),
    [
      '/',
      '/hotels/casa-aurelia',
      '/inquire?hotel=hotel-bengaluru-jayanagar&room=hotel-bengaluru-female-dorm',
      '/search?destination=amalfi-coast&rating=4.5',
      '/admin/login',
    ].sort(),
    'fixed journey routes',
  )
  for (const omission of inputs.omissions) {
    if (
      !object(omission) ||
      !journeyIds.has(omission.journey) ||
      !profiles.has(omission.profile) ||
      expected.has(`${omission.journey}/${omission.profile}`)
    )
      fail('Invalid journey omission')
    text(omission.reason, 'journey omission reason')
  }
  for (const sample of report.samples) {
    if (!object(sample)) fail('Malformed journey sample')
    const key = `${sample.journey}/${sample.profile}`
    if (!expected.has(key)) fail('Unexpected journey/profile sample')
    integer(sample.run, 'sample run')
    if (sample.run < 1 || sample.run > inputs.runs)
      fail('Journey run index outside expected range')
    const rows = expected.get(key)
    if (rows.some((row) => row.run === sample.run))
      fail('Duplicate journey run')
    if (
      !Array.isArray(sample.phases) ||
      !sample.phases.length ||
      !Array.isArray(sample.screenshots)
    )
      fail('Missing raw journey phase/screenshot evidence')
    const phaseNames = new Set()
    for (const phase of sample.phases) {
      if (
        !object(phase) ||
        !['navigation', 'activation', 'deferred-loading', 'setup'].includes(
          phase.kind,
        ) ||
        phaseNames.has(phase.name)
      )
        fail('Malformed/duplicate raw journey phase')
      phaseNames.add(text(phase.name, 'phase name'))
      if (!object(phase.network) || !object(phase.observations))
        fail('Missing raw network/observer evidence')
      if (
        !Array.isArray(phase.network.resources) ||
        !Array.isArray(phase.network.resourceTiming) ||
        !Array.isArray(phase.observations.events) ||
        !object(phase.observations.longTasks) ||
        !object(phase.observations.layoutShifts) ||
        !object(phase.observations.unsupported)
      )
        fail('Incomplete raw network/observer evidence')
      for (const metric of ['requests', 'encodedBytes', 'decodedBytes'])
        number(phase.network[metric], `raw network ${metric}`)
      for (const resource of [
        ...phase.network.resources,
        ...phase.network.resourceTiming,
      ]) {
        if (!object(resource)) fail('Malformed raw resource evidence')
        checkUrl(resource.url, 'journey resource URL')
      }
    }
    for (const screenshot of sample.screenshots)
      await artifactFile(directory, screenshot)
    const metrics = flattenMetrics(sample.metrics)
    if (!object(sample.metrics.phases))
      fail('Missing per-phase journey metrics')
    equal(
      Object.keys(sample.metrics.phases).sort(),
      [...phaseNames].sort(),
      'raw/aggregate phase names',
    )
    const requiredMetrics = [
      'inputToNextFrameMs',
      'durationMs',
      'encodedBytes',
      'decodedBytes',
      'requestCount',
      'eventDurationMaxMs',
      'longTaskCount',
      'longTaskTotalMs',
      'longTaskMaxMs',
      'layoutShiftWithoutInput',
      'layoutShiftWithInput',
    ]
    for (const phase of sample.phases) {
      for (const metric of requiredMetrics) {
        if (!Object.hasOwn(sample.metrics.phases[phase.name], metric))
          fail(`Missing phase metric: ${metric}`)
      }
      for (const metric of ['encodedBytes', 'decodedBytes'])
        equal(
          sample.metrics.phases[phase.name][metric],
          phase.network[metric],
          `raw/aggregate network ${metric}`,
        )
      equal(
        sample.metrics.phases[phase.name].requestCount,
        phase.network.requests,
        'raw/aggregate request count',
      )
      for (const [metric, value] of Object.entries(
        sample.metrics.phases[phase.name],
      )) {
        if (value !== null) continue
        const reason =
          metric === 'inputToNextFrameMs' || metric === 'durationMs'
            ? phase.timingReason
            : Object.values(phase.observations.unsupported).find(
                (item) => typeof item === 'string' && item,
              )
        if (typeof reason !== 'string' || !reason)
          fail(`Missing reason for unavailable metric: ${metric}`)
      }
    }
    if (rows.length) {
      equal(
        Object.keys(metrics).sort(),
        Object.keys(rows[0].metrics).sort(),
        `metric names for ${key}`,
      )
      equal(
        sample.phases.map((phase) => ({ name: phase.name, kind: phase.kind })),
        rows[0].sample.phases.map((phase) => ({
          name: phase.name,
          kind: phase.kind,
        })),
        `phase protocol for ${key}`,
      )
    }
    rows.push({ run: sample.run, metrics, sample })
  }
  for (const [key, rows] of expected) {
    if (rows.length !== inputs.runs) fail(`Incomplete journey runs: ${key}`)
    rows.sort((a, b) => a.run - b.run)
  }
  for (const key of ['sourceRevision', 'lockfileSha256', 'manifestSha256']) {
    if (report.environment[key] !== bundle[key])
      fail(`Journey and bundle ${key} differ within one variant`)
  }
  return { ...loaded, groups: expected }
}

async function reportFiles(directory, prefix = '') {
  const result = []
  for (const entry of await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  })) {
    const filename = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory())
      result.push(...(await reportFiles(directory, filename)))
    else if (
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      entry.name !== 'manifest.json'
    )
      result.push(filename)
  }
  return result.sort()
}
async function loadLighthouse(directory, profile, origin) {
  const groups = new Map(routes.map((route) => [route, []]))
  let reference
  for (const filename of await reportFiles(directory)) {
    const loaded = await json(await artifactFile(directory, filename))
    const report = loaded.value
    if (
      !object(report) ||
      !object(report.audits) ||
      !object(report.categories) ||
      !object(report.configSettings) ||
      !object(report.environment)
    )
      fail(`Not a complete Lighthouse JSON report: ${filename}`)
    if (report.runtimeError) fail(`Lighthouse runtime error: ${filename}`)
    const requested = checkUrl(report.requestedUrl, 'Lighthouse requested URL')
    const final = checkUrl(
      report.finalDisplayedUrl ?? report.finalUrl,
      'Lighthouse final URL',
    )
    if (
      requested.origin !== origin ||
      requested.search ||
      requested.hash ||
      !groups.has(requested.pathname)
    )
      fail('Unexpected Lighthouse route/origin')
    if (final.href !== requested.href)
      fail('Lighthouse report redirected away from the canonical route')
    const settings = report.configSettings
    if (
      settings.formFactor !== profile ||
      settings.throttlingMethod !== 'simulate' ||
      settings.screenEmulation?.mobile !== (profile === 'mobile')
    )
      fail(`Incorrect Lighthouse ${profile} configuration`)
    if (settings.extraHeaders && Object.keys(settings.extraHeaders).length)
      fail(
        'Credential-capable extraHeaders cannot be retained in benchmark artifacts',
      )
    if (
      !Array.isArray(report.runWarnings) ||
      report.runWarnings.some((warning) => typeof warning !== 'string')
    )
      fail('Missing Lighthouse warnings')
    rejectSecrets(settings)
    rejectSecrets(report.environment)
    const inputs = {
      lighthouseVersion: text(report.lighthouseVersion, 'Lighthouse version'),
      configSettings: settings,
      browser: {
        userAgent: text(report.userAgent, 'Lighthouse browser user agent'),
        hostUserAgent: text(
          report.environment.hostUserAgent,
          'Lighthouse host browser user agent',
        ),
        networkUserAgent: text(
          report.environment.networkUserAgent,
          'Lighthouse network user agent',
        ),
      },
    }
    if (reference)
      equal(
        inputs,
        reference,
        `Lighthouse ${profile} browser/version/config across runs`,
      )
    else reference = inputs
    const metrics = {}
    for (const category of categories) {
      const score = number(
        report.categories[category]?.score,
        `category ${category}`,
      )
      if (score > 1) fail('Lighthouse category score outside [0,1]')
      metrics[`score.${category}`] = {
        value: score * 100,
        unit: 'score points',
      }
    }
    for (const audit of auditNames) {
      metrics[audit] = {
        value: number(report.audits[audit]?.numericValue, audit),
        unit: text(report.audits[audit]?.numericUnit, `audit unit ${audit}`),
      }
    }
    const htmlName = filename.replace(/\.json$/, '.html')
    const htmlBytes = await readFile(await artifactFile(directory, htmlName))
    if (!htmlBytes.length) fail('Empty Lighthouse HTML report')
    groups.get(requested.pathname).push({
      json: filename,
      jsonSha256: loaded.sha256,
      html: htmlName,
      htmlSha256: hash(htmlBytes),
      fetchTime: text(report.fetchTime, 'Lighthouse fetch time'),
      requestedUrl: report.requestedUrl,
      finalUrl: final.href,
      warnings: report.runWarnings,
      environment: report.environment,
      metrics,
    })
  }
  for (const [route, rows] of groups) {
    if (rows.length !== 5)
      fail(
        `Lighthouse ${profile} ${route} needs exactly five complete runs; found ${rows.length}`,
      )
    if (new Set(rows.map((row) => row.jsonSha256)).size !== rows.length)
      fail('Duplicate Lighthouse raw reports')
  }
  return { inputs: reference, groups }
}
async function loadEnvironment(root, bundle, journeys, lighthouse) {
  const loaded = await json(await artifactFile(root, 'environment.json'))
  const environment = loaded.value
  if (
    !object(environment) ||
    !object(environment.os) ||
    !object(environment.fixtures) ||
    !object(environment.playwright) ||
    !object(environment.chrome) ||
    !Array.isArray(environment.snapshots)
  )
    fail('Missing fixed experiment environment')
  rejectSecrets(environment)
  for (const key of ['platform', 'release', 'arch', 'cpus'])
    text(environment.os[key], `environment OS ${key}`)
  number(environment.os.memory, 'environment memory')
  for (const key of ['database', 'media', 'seed'])
    text(environment.fixtures[key], `environment fixture ${key}`)
  for (const key of ['sourceRevision', 'lockfileSha256', 'manifestSha256']) {
    equal(environment[key], bundle[key], `recorded environment ${key}`)
  }
  for (const key of [
    'node',
    'pnpm',
    'dotnet',
    'lighthouse',
    'origin',
    'protocol',
  ])
    text(environment[key], `environment ${key}`)
  equal(environment.node, bundle.nodeVersion, 'environment/bundle Node version')
  equal(
    environment.origin,
    journeys.inputs.origin,
    'environment/journey origin',
  )
  equal(
    environment.protocol,
    journeys.inputs.protocol,
    'environment/journey protocol',
  )
  equal(
    environment.playwright.executable,
    journeys.inputs.browser.executable,
    'environment/journey browser executable',
  )
  equal(
    environment.playwright.version,
    journeys.inputs.browser.version,
    'environment/journey browser version',
  )
  text(environment.chrome.executable, 'Lighthouse Chrome executable')
  const chromeVersion = text(
    environment.chrome.version,
    'Lighthouse Chrome version',
  ).match(/\d+\.\d+\.\d+\.\d+/)?.[0]
  if (!chromeVersion) fail('Malformed recorded Chrome version')
  for (const profile of ['desktop', 'mobile']) {
    equal(
      environment.lighthouse,
      lighthouse[profile].inputs.lighthouseVersion,
      'recorded Lighthouse version',
    )
    const reportedVersion = lighthouse[
      profile
    ].inputs.browser.hostUserAgent.match(
      /(?:Headless)?Chrome\/(\d+\.\d+\.\d+\.\d+)/,
    )?.[1]
    // Modern Chrome reduces its UA to major.0.0.0; the recorded executable
    // version is still compared in full between experiment environments.
    if (
      reportedVersion !== chromeVersion &&
      reportedVersion !== `${chromeVersion.split('.')[0]}.0.0.0`
    )
      fail('Recorded Chrome version differs from Lighthouse actual browser')
  }
  const snapshots = new Map()
  const runtime = bundle.entryKeys.public
  const manifest = JSON.parse(
    (
      await readFile(
        await artifactFile(
          await realpath(path.join(root, 'bundle')),
          'manifest.json',
        ),
      )
    ).toString('utf8'),
  )
  for (const snapshot of environment.snapshots) {
    if (
      !object(snapshot) ||
      !routes.includes(snapshot.route) ||
      snapshots.has(snapshot.route) ||
      snapshot.status !== 200 ||
      snapshot.canonical !== environment.origin + snapshot.route ||
      !isHash(snapshot.version) ||
      ![
        manifest[runtime].file,
        `assets/${manifest[runtime].file}`,
        `/assets/${manifest[runtime].file}`,
      ].includes(snapshot.runtime)
    ) {
      fail('Incomplete/stale canonical snapshot environment evidence')
    }
    snapshots.set(snapshot.route, snapshot)
  }
  if (
    snapshots.size !== routes.length ||
    new Set([...snapshots.values()].map((snapshot) => snapshot.version))
      .size !== 1
  )
    fail('Incomplete or mixed snapshot releases')
  return loaded
}
function fixedEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) =>
        ![
          'sourceRevision',
          'sourceTreeSha256',
          'lockfileSha256',
          'manifestSha256',
          'snapshots',
          'snapshotVersion',
          'snapshotVersions',
        ].includes(key),
    ),
  )
}

async function loadVariant(directory) {
  const root = await realpath(directory)
  const bundle = await loadBundles(await realpath(path.join(root, 'bundle')))
  const journeys = await loadJourneys(
    await realpath(path.join(root, 'interactions')),
    bundle.value,
  )
  const lighthouse = {}
  for (const profile of ['desktop', 'mobile'])
    lighthouse[profile] = await loadLighthouse(
      await realpath(path.join(root, profile)),
      profile,
      journeys.value.inputs.origin,
    )
  equal(
    lighthouse.desktop.inputs.lighthouseVersion,
    lighthouse.mobile.inputs.lighthouseVersion,
    'desktop/mobile Lighthouse versions',
  )
  equal(
    lighthouse.desktop.inputs.browser.hostUserAgent,
    lighthouse.mobile.inputs.browser.hostUserAgent,
    'desktop/mobile actual Chrome browser',
  )
  const environment = await loadEnvironment(
    root,
    bundle.value,
    journeys.value,
    lighthouse,
  )
  return { bundle, journeys, lighthouse, environment }
}
function provenance(variant) {
  return {
    bundlesJsonSha256: variant.bundle.sha256,
    journeysJsonSha256: variant.journeys.sha256,
    sourceRevision: variant.bundle.value.sourceRevision,
    lockfileSha256: variant.bundle.value.lockfileSha256,
    manifestSha256: variant.bundle.value.manifestSha256,
    nodeVersion: variant.bundle.value.nodeVersion,
    journeyEnvironment: variant.journeys.value.environment,
    environmentJsonSha256: variant.environment.sha256,
    environment: variant.environment.value,
  }
}
function compareBundles(before, after) {
  const result = {}
  for (const scope of scopeNames) {
    result[scope] = {}
    for (const kind of ['js', 'css', 'other', 'all']) {
      const left = before.scopes[scope].totals[kind]
      const right = after.scopes[scope].totals[kind]
      result[scope][kind] = Object.fromEntries(
        ['count', ...byteMetrics].map((metric) => [
          metric,
          {
            before: left[metric],
            after: right[metric],
            ...delta(left[metric], right[metric]),
          },
        ]),
      )
    }
  }
  return result
}
function compareJourneys(before, after) {
  equal(
    before.value.inputs,
    after.value.inputs,
    'journey routes/profiles/runs/browser/instrumentation',
  )
  // Source/assets/snapshot publication necessarily differ; laboratory hardware/tool versions must not.
  equal(
    fixedEnvironment(before.value.environment),
    fixedEnvironment(after.value.environment),
    'journey experiment environment',
  )
  const result = []
  for (const [key, left] of before.groups) {
    const right = after.groups.get(key)
    equal(
      Object.keys(left[0].metrics).sort(),
      Object.keys(right[0].metrics).sort(),
      `journey ${key} metric names`,
    )
    equal(
      left[0].sample.phases.map((phase) => ({
        name: phase.name,
        kind: phase.kind,
      })),
      right[0].sample.phases.map((phase) => ({
        name: phase.name,
        kind: phase.kind,
      })),
      `journey ${key} phase protocol`,
    )
    result.push({
      journey: left[0].sample.journey,
      profile: left[0].sample.profile,
      metrics: Object.fromEntries(
        Object.keys(left[0].metrics)
          .sort()
          .map((metric) => [
            metric,
            compareValues(
              left.map((row) => row.metrics[metric]),
              right.map((row) => row.metrics[metric]),
            ),
          ]),
      ),
      samples: {
        before: left.map((row) => row.sample),
        after: right.map((row) => row.sample),
      },
    })
  }
  return { inputs: before.value.inputs, groups: result }
}
function compareLighthouse(before, after) {
  const result = {}
  for (const profile of ['desktop', 'mobile']) {
    const left = before[profile]
    const right = after[profile]
    equal(
      left.inputs,
      right.inputs,
      `Lighthouse ${profile} versions/browser/effective configuration`,
    )
    result[profile] = {
      inputs: left.inputs,
      routes: [...left.groups].map(([route, runs]) => {
        const next = right.groups.get(route)
        const metrics = {}
        for (const metric of Object.keys(runs[0].metrics)) {
          const unit = runs[0].metrics[metric].unit
          for (const run of [...runs, ...next])
            equal(run.metrics[metric].unit, unit, `Lighthouse ${metric} units`)
          const comparison = compareValues(
            runs.map((run) => run.metrics[metric].value),
            next.map((run) => run.metrics[metric].value),
          )
          if (metric.startsWith('score.')) {
            for (const summary of Object.values(comparison.delta))
              summary.scorePointChange = summary.absolute
          }
          metrics[metric] = { unit, ...comparison }
        }
        return { route, metrics, runs: { before: runs, after: next } }
      }),
    }
  }
  return result
}
function format(value) {
  if (value === null) return 'n/a'
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}
function cell(value) {
  return String(value)
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
    .replaceAll('\r', ' ')
}
function summaryTable(metrics) {
  const lines = [
    '| Metric | Before median [min, max] | After median [min, max] | Median Δ | Δ % | Samples before / after (available) |',
    '|---|---:|---:|---:|---:|---:|',
  ]
  for (const [metric, result] of Object.entries(metrics)) {
    const render = (stats) =>
      `${format(stats.median)} [${format(stats.min)}, ${format(stats.max)}]`
    lines.push(
      `| ${cell(metric)}${result.unit ? ` (${cell(result.unit)})` : ''} | ${render(result.before)} | ${render(result.after)} | ${format(result.delta.median.absolute)} | ${format(result.delta.median.percentage)} | ${result.before.sampleCount} / ${result.after.sampleCount} (${result.before.availableCount} / ${result.after.availableCount}) |`,
    )
  }
  return lines.join('\n')
}
function markdown(result) {
  const lines = [
    '# Paired benchmark comparison',
    '',
    'All deltas are after minus before. Positive timing/byte deltas are increases. A zero baseline or unavailable metric has no percentage delta. Score deltas are score points on a 0–100 scale.',
    '',
    'Compression totals are synthetic gzip level 9 / Brotli quality 11 estimates, not observed network transfer. Public and admin closures are reported separately; combined totals deduplicate shared files and exclude retained releases. Interaction timings are laboratory input-to-DOM-plus-next-frame measurements, not field INP. Navigation, lazy transfer and warm-module activations remain separate. Small-sample interaction measurements do not establish statistical significance.',
    '',
    'Lighthouse statistics use each metric from all five raw reports, not the metric vector of LHCI’s representative median report.',
    '',
    '## Provenance',
    '',
    '| Input | Before | After |',
    '|---|---|---|',
  ]
  for (const key of [
    'sourceRevision',
    'lockfileSha256',
    'manifestSha256',
    'bundlesJsonSha256',
    'journeysJsonSha256',
  ])
    lines.push(
      `| ${key} | ${cell(result.provenance.before[key])} | ${cell(result.provenance.after[key])} |`,
    )
  lines.push(
    '',
    'Fixed browser, environment, routes, profiles, run counts and effective configurations were checked for equality. Full inputs, raw interaction samples, metric values, report hashes and Lighthouse warnings are retained in comparison.json.',
    '',
    '## Manifest-scoped bundles',
    '',
    '| Scope | Kind | Measure | Before | After | Δ | Δ % |',
    '|---|---|---|---:|---:|---:|---:|',
  )
  for (const [scope, kinds] of Object.entries(result.bundles.scopes)) {
    for (const [kind, metrics] of Object.entries(kinds)) {
      for (const [metric, row] of Object.entries(metrics))
        lines.push(
          `| ${scope} | ${kind} | ${metric} | ${format(row.before)} | ${format(row.after)} | ${format(row.absolute)} | ${format(row.percentage)} |`,
        )
    }
  }
  lines.push('', '## Journeys')
  for (const group of result.journeys.groups)
    lines.push(
      '',
      `### ${cell(group.journey)} — ${cell(group.profile)}`,
      '',
      summaryTable(group.metrics),
    )
  if (result.journeys.inputs.omissions.length) {
    lines.push('', '### Explicit omissions', '')
    for (const item of result.journeys.inputs.omissions)
      lines.push(
        `- ${cell(item.journey)} / ${cell(item.profile)}: ${cell(item.reason)}`,
      )
  }
  lines.push('', '## Lighthouse')
  for (const [profile, group] of Object.entries(result.lighthouse)) {
    lines.push(
      '',
      `### ${profile}`,
      '',
      `Lighthouse ${cell(group.inputs.lighthouseVersion)}; browser: ${cell(group.inputs.browser.hostUserAgent)}.`,
    )
    for (const route of group.routes) {
      lines.push(
        '',
        `#### ${cell(route.route)}`,
        '',
        summaryTable(route.metrics),
      )
      for (const variant of ['before', 'after']) {
        route.runs[variant].forEach((run, index) => {
          for (const warning of run.warnings)
            lines.push(
              `- ${variant} run ${index + 1} warning: ${cell(warning)}`,
            )
        })
      }
    }
  }
  return lines.join('\n') + '\n'
}
async function main() {
  const options = args(process.argv.slice(2))
  if (
    (await realpath(options['--before'])) ===
    (await realpath(options['--after']))
  )
    fail('Before and after must be different experiment directories')
  const output = options['--output']
  await mkdir(output, { recursive: true })
  if ((await readdir(output)).length)
    fail('Output directory must be empty; use a new comparison directory')
  const before = await loadVariant(options['--before'])
  const after = await loadVariant(options['--after'])
  equal(
    before.bundle.value.nodeVersion,
    after.bundle.value.nodeVersion,
    'bundle Node versions',
  )
  equal(
    fixedEnvironment(before.environment.value),
    fixedEnvironment(after.environment.value),
    'recorded hardware/tools/fixtures/browser experiment environment',
  )
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    notes: [
      'Deltas are after minus before.',
      'Zero baseline gives a null percentage.',
      'gzip/Brotli are synthetic per-file estimates, not network bytes.',
      'Input-to-next-frame measurements and Event Timing observations are not field INP.',
      'No statistical significance is claimed.',
    ],
    provenance: { before: provenance(before), after: provenance(after) },
    bundles: {
      compression: before.bundle.value.compression,
      entryKeys,
      scopeDefinitions: before.bundle.value.scopeDefinitions,
      scopes: compareBundles(before.bundle.value, after.bundle.value),
      files: {
        before: before.bundle.value.files,
        after: after.bundle.value.files,
      },
    },
    journeys: compareJourneys(before.journeys, after.journeys),
    lighthouse: compareLighthouse(before.lighthouse, after.lighthouse),
  }
  await writeFile(
    path.join(output, 'comparison.json'),
    JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx' },
  )
  await writeFile(path.join(output, 'comparison.md'), markdown(result), {
    flag: 'wx',
  })
  console.log(`Saved paired benchmark comparison to ${output}`)
}
main().catch((error) => {
  console.error(`Benchmark comparison failed: ${error.message}`)
  process.exitCode = 1
})

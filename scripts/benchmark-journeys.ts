#!/usr/bin/env -S pnpm exec tsx
import { chromium } from 'playwright'
import type {
  Browser,
  BrowserContext,
  CDPSession,
  Locator,
  Page,
  Request,
} from 'playwright'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { arch, platform, release, cpus, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HomePage } from '../tests/e2e/pages/home'
import { InquiryPage } from '../tests/e2e/pages/inquiry'
import { AdminPage } from '../tests/e2e/pages/admin'
import { SearchPage } from '../tests/e2e/pages/search'

// These are laboratory interaction profiles, not Lighthouse or field INP.
const profiles = [
  {
    id: 'desktop',
    viewport: { width: 1568, height: 900 },
    isMobile: false,
    hasTouch: false,
    cpuSlowdown: 1,
    network: null,
  },
  {
    id: 'mobile',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    cpuSlowdown: 4,
    network: {
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
    },
  },
] as const
const journeys = [
  { id: 'mobile-navigation', route: '/', profiles: ['mobile'] },
  {
    id: 'gallery',
    route: '/hotels/casa-aurelia',
    profiles: ['desktop', 'mobile'],
  },
  {
    id: 'inquiry-calendar',
    route:
      '/inquire?hotel=hotel-bengaluru-jayanagar&room=hotel-bengaluru-female-dorm',
    profiles: ['desktop', 'mobile'],
  },
  {
    id: 'search',
    route: '/search?destination=amalfi-coast&rating=4.5',
    profiles: ['desktop', 'mobile'],
  },
  {
    id: 'admin-control',
    route: '/admin/login',
    profiles: ['desktop', 'mobile'],
  },
]
type Profile = (typeof profiles)[number]
type Condition = {
  selector: string
  mode?: 'visible' | 'absent' | 'value' | 'text' | 'focused' | 'selection'
  value?: string
}
type Resource = {
  url: string
  type: string | null
  encodedBytes: number | null
  complete: boolean
  phase: string | null
}
type ResourceTiming = {
  url: string
  type: string
  startTime: number
  duration: number
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
}
type EventObservation = {
  name: string
  startTime: number
  duration: number
  interactionId: number
  processingStart: number
  processingEnd: number
}
type TaskObservation = { name: string; startTime: number; duration: number }
type ShiftObservation = {
  startTime: number
  value: number
  hadRecentInput: boolean
}
type LayoutShiftEntry = PerformanceEntry & {
  value: number
  hadRecentInput: boolean
}
type ArmedInput = {
  inputAt: number | null
  completedAt: number | null
  eventName: string
  targetSelector: string | null
  check: (() => void) | null
}
type ObserverState = {
  events: EventObservation[]
  longTasks: TaskObservation[]
  shifts: ShiftObservation[]
  unsupported: Record<string, string>
  observers: PerformanceObserver[]
  armed: ArmedInput | null
}
declare global {
  interface Window {
    __journeyBenchmark: ObserverState
  }
}
type Phase = {
  name: string
  kind: 'navigation' | 'activation' | 'deferred-loading' | 'setup'
  inputToNextFrameMs: number | null
  timingReason: string | null
  durationMs: number
  navigationTiming: {
    durationMs: number
    responseEndMs: number
    domContentLoadedMs: number
    loadEventMs: number
  } | null
  network: {
    requests: number
    encodedBytes: number
    decodedBytes: number
    resources: Resource[]
    resourceTiming: ResourceTiming[]
  }
  observations: {
    events: EventObservation[]
    longTaskEntries: TaskObservation[]
    layoutShiftEntries: ShiftObservation[]
    longTasks: {
      count: number | null
      totalMs: number | null
      maxMs: number | null
    }
    layoutShifts: {
      withRecentInput: number | null
      withoutRecentInput: number | null
    }
    unsupported: Record<string, string>
  }
}
type NumericMetrics = Record<string, number | null>
type Sample = {
  journey: string
  profile: string
  run: number
  metrics: { phases: Record<string, NumericMetrics> }
  phases: Phase[]
  screenshots: string[]
  snapshotVersions: string[]
}
type MetricSummary = {
  count: number
  missing: number
  median: number | null
  min: number | null
  max: number | null
}
class BenchmarkError extends Error {}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BenchmarkError(message)
}
function args() {
  const options = new Map<string, string>()
  const raw = process.argv.slice(2)
  for (let i = 0; i < raw.length; i += 2) {
    requireThat(
      ['--origin', '--output', '--runs'].includes(raw[i]) &&
        raw[i + 1] &&
        !raw[i + 1].startsWith('--') &&
        !options.has(raw[i]),
      'Usage: pnpm exec tsx scripts/benchmark-journeys.ts --origin <http(s) origin> --output <empty directory> --runs 10',
    )
    options.set(raw[i], raw[i + 1])
  }
  requireThat(
    options.has('--origin') && options.has('--output'),
    '--origin and --output are required',
  )
  const origin = new URL(options.get('--origin')!)
  requireThat(
    ['http:', 'https:'].includes(origin.protocol) &&
      !origin.username &&
      !origin.password &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash,
    '--origin must be an HTTP(S) origin without credentials, path, or query',
  )
  const runsText = options.get('--runs') ?? '10'
  requireThat(
    /^[1-9]\d*$/.test(runsText) && Number.isSafeInteger(Number(runsText)),
    '--runs must be a positive integer',
  )
  return {
    origin: origin.origin,
    output: resolve(options.get('--output')!),
    runs: Number(runsText),
  }
}
function safeUrl(value: string) {
  const url = new URL(value)
  // Never retain authentication/query tokens, signed media queries, or fragments.
  return `${url.protocol}//${url.host}${url.pathname}`
}
async function hash(path: string) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}
function command(binary: string, argv: string[], cwd: string) {
  return execFileSync(binary, argv, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

// Installed before each document's application code. Observer capability absence
// stays null with a reason, not a misleading zero. No request bodies or headers.
function installObservers() {
  const state: ObserverState = {
    events: [],
    longTasks: [],
    shifts: [],
    unsupported: {},
    observers: [],
    armed: null,
  }
  window.__journeyBenchmark = state
  performance.setResourceTimingBufferSize(10000)
  for (const type of ['event', 'longtask', 'layout-shift']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) {
      state.unsupported[type] = 'Not supported by this browser'
      continue
    }
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === 'event') {
            // The observer's registered entry type establishes this DOM boundary.
            const event = entry as PerformanceEventTiming
            state.events.push({
              name: event.name,
              startTime: event.startTime,
              duration: event.duration,
              interactionId: event.interactionId,
              processingStart: event.processingStart,
              processingEnd: event.processingEnd,
            })
          } else if (type === 'longtask') {
            state.longTasks.push({
              name: entry.name,
              startTime: entry.startTime,
              duration: entry.duration,
            })
          } else {
            // LayoutShift is supported by Chromium but absent from some DOM declarations.
            const shift = entry as LayoutShiftEntry
            state.shifts.push({
              startTime: shift.startTime,
              value: shift.value,
              hadRecentInput: shift.hadRecentInput,
            })
          }
        }
      })
      observer.observe({
        type,
        buffered: true,
        ...(type === 'event' ? { durationThreshold: 16 } : {}),
      })
      state.observers.push(observer)
    } catch {
      state.unsupported[type] = 'Observer registration failed in this browser'
    }
  }
  for (const eventName of ['click', 'input', 'change', 'keydown']) {
    document.addEventListener(
      eventName,
      (event) => {
        const armed = state.armed
        if (
          !armed ||
          armed.inputAt !== null ||
          !event.isTrusted ||
          event.type !== armed.eventName
        )
          return
        const target = event.target as Element | null
        if (armed.targetSelector && !target?.closest(armed.targetSelector))
          return
        armed.inputAt =
          event.timeStamp > performance.timeOrigin
            ? event.timeStamp - performance.timeOrigin
            : event.timeStamp
        queueMicrotask(() => armed.check?.())
      },
      true,
    )
  }
}

class Recorder {
  readonly phases: Phase[] = []
  readonly screenshots: string[] = []
  readonly snapshotVersions: string[] = []
  currentPhase: string | null = null
  private resources: Resource[] = []
  private pending = new Map<string, Resource>()
  private invalid = false
  private documents = 0
  private phaseStart = 0
  private phaseKind: Phase['kind'] = 'setup'
  private reasons: string[] = []
  constructor(
    readonly page: Page,
    readonly cdp: CDPSession,
    readonly output: string,
    readonly prefix: string,
  ) {
    page.on('pageerror', () => this.fail('page-error'))
    page.on('console', (message) => {
      if (
        message.type() === 'error' ||
        /hydration|hydrating|did not match|server rendered HTML/i.test(
          message.text(),
        )
      )
        this.fail('console-or-hydration-error')
    })
    page.on('requestfailed', () => this.fail('failed-resource'))
    page.on('response', (response) => {
      if (response.status() >= 400) this.fail('http-resource-error')
      if (
        response.request().isNavigationRequest() &&
        response.request().resourceType() === 'document'
      ) {
        const version = response.headers()['x-snapshot-version']
        if (version) this.snapshotVersions.push(version)
      }
    })
    cdp.on('Network.requestWillBeSent', (event) => {
      if (!/^https?:/.test(event.request.url)) return
      if (event.type === 'Document') this.documents++
      const prior = this.pending.get(event.requestId)
      if (prior && event.redirectResponse) {
        prior.encodedBytes = event.redirectResponse.encodedDataLength
        prior.complete = true
      }
      const resource: Resource = {
        url: safeUrl(event.request.url),
        type: event.type ?? null,
        encodedBytes: null,
        complete: false,
        phase: this.currentPhase,
      }
      this.resources.push(resource)
      this.pending.set(event.requestId, resource)
    })
    cdp.on('Network.loadingFinished', (event) => {
      const resource = this.pending.get(event.requestId)
      if (resource) {
        resource.encodedBytes = event.encodedDataLength
        resource.complete = true
        this.pending.delete(event.requestId)
      }
    })
    cdp.on('Network.loadingFailed', (event) => {
      this.pending.delete(event.requestId)
      this.fail('cdp-failed-resource')
    })
  }
  fail(reason: string) {
    this.invalid = true
    this.reasons.push(reason)
  }
  assertValid() {
    requireThat(
      !this.invalid,
      `Invalid journey ${this.prefix}: ${[...new Set(this.reasons)].join(', ')}`,
    )
  }
  get documentCount() {
    return this.documents
  }
  async begin(name: string, kind: Phase['kind']) {
    this.assertValid()
    requireThat(this.currentPhase === null, 'Cannot overlap benchmark phases')
    this.currentPhase = name
    this.phaseKind = kind
    this.phaseStart =
      kind === 'navigation'
        ? 0
        : await this.page.evaluate(() => performance.now())
  }
  async end(input = false) {
    requireThat(this.currentPhase, 'No active benchmark phase')
    // Settle resources and observer delivery, outside the browser input-to-frame metric.
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForTimeout(100)
    // SPA fetches can outlive Playwright's document load-state bookkeeping.
    // Wait for CDP body completion before attributing encoded bytes to this phase.
    if (this.pending.size)
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout)
          this.cdp.off('Network.loadingFinished', settled)
          this.cdp.off('Network.loadingFailed', settled)
        }
        const settled = () => {
          if (this.pending.size) return
          cleanup()
          resolve()
        }
        const timeout = setTimeout(() => {
          cleanup()
          reject(
            new BenchmarkError('Timed out collecting complete network bodies'),
          )
        }, 30000)
        this.cdp.on('Network.loadingFinished', settled)
        this.cdp.on('Network.loadingFailed', settled)
        settled()
      })
    const observed = await this.page.evaluate(
      ({ start, input, navigation }) => {
        const state = window.__journeyBenchmark
        if (!state) throw new Error('Benchmark observers missing')
        const events = state.events.filter((entry) => entry.startTime >= start)
        const longTasks = state.longTasks.filter(
          (entry) => entry.startTime >= start,
        )
        const shifts = state.shifts.filter((entry) => entry.startTime >= start)
        const resourceTiming = performance
          .getEntriesByType('resource')
          .filter(
            (entry) => entry.startTime >= start && /^https?:/.test(entry.name),
          )
          .map((entry) => {
            // getEntriesByType('resource') returns resource entries at this DOM boundary.
            const resource = entry as PerformanceResourceTiming
            return {
              url: resource.name,
              type: resource.initiatorType,
              startTime: resource.startTime,
              duration: resource.duration,
              transferSize: resource.transferSize,
              encodedBodySize: resource.encodedBodySize,
              decodedBodySize: resource.decodedBodySize,
            }
          })
        // The document itself is a navigation entry, not a resource entry.
        const documentEntry = performance.getEntriesByType('navigation')[0] as
          | PerformanceNavigationTiming
          | undefined
        if (navigation && documentEntry)
          resourceTiming.unshift({
            url: documentEntry.name,
            type: 'navigation',
            startTime: documentEntry.startTime,
            duration: documentEntry.duration,
            transferSize: documentEntry.transferSize,
            encodedBodySize: documentEntry.encodedBodySize,
            decodedBodySize: documentEntry.decodedBodySize,
          })
        const taskUnavailable = !!state.unsupported.longtask
        const shiftUnavailable = !!state.unsupported['layout-shift']
        const armed = state.armed
        if (
          input &&
          (!armed || armed.inputAt === null || armed.completedAt === null)
        )
          throw new Error('Input/state timing was not observed')
        return {
          durationMs: performance.now() - start,
          inputToNextFrameMs:
            input &&
            armed &&
            armed.completedAt !== null &&
            armed.inputAt !== null
              ? armed.completedAt - armed.inputAt
              : null,
          navigationTiming:
            navigation && documentEntry
              ? {
                  durationMs: documentEntry.duration,
                  responseEndMs: documentEntry.responseEnd,
                  domContentLoadedMs: documentEntry.domContentLoadedEventEnd,
                  loadEventMs: documentEntry.loadEventEnd,
                }
              : null,
          resourceTiming,
          observations: {
            events,
            longTaskEntries: longTasks,
            layoutShiftEntries: shifts,
            longTasks: {
              count: taskUnavailable ? null : longTasks.length,
              totalMs: taskUnavailable
                ? null
                : longTasks.reduce((sum, entry) => sum + entry.duration, 0),
              maxMs: taskUnavailable
                ? null
                : Math.max(0, ...longTasks.map((entry) => entry.duration)),
            },
            layoutShifts: {
              withRecentInput: shiftUnavailable
                ? null
                : shifts
                    .filter((entry) => entry.hadRecentInput)
                    .reduce((sum, entry) => sum + entry.value, 0),
              withoutRecentInput: shiftUnavailable
                ? null
                : shifts
                    .filter((entry) => !entry.hadRecentInput)
                    .reduce((sum, entry) => sum + entry.value, 0),
            },
            unsupported: {
              ...state.unsupported,
              ...(!events.length && !state.unsupported.event
                ? {
                    event:
                      'No Event Timing entries met the 16ms duration threshold in this phase',
                  }
                : {}),
            },
          },
        }
      },
      {
        start: this.phaseStart,
        input,
        navigation: this.phaseKind === 'navigation',
      },
    )
    const resources = this.resources.filter(
      (entry) => entry.phase === this.currentPhase,
    )
    requireThat(
      resources.every((entry) => entry.complete && entry.encodedBytes !== null),
      `Incomplete network collection in ${this.prefix}/${this.currentPhase}`,
    )
    observed.resourceTiming = observed.resourceTiming.map((entry) => ({
      ...entry,
      url: safeUrl(entry.url),
    }))
    this.phases.push({
      name: this.currentPhase,
      kind: this.phaseKind,
      durationMs: observed.durationMs,
      inputToNextFrameMs: observed.inputToNextFrameMs,
      navigationTiming: observed.navigationTiming,
      timingReason: input
        ? null
        : this.phaseKind === 'navigation'
          ? 'Full document navigation collection window; not an interaction/INP metric'
          : 'Setup/deferred loading has no primary input timing',
      network: {
        requests: resources.length,
        encodedBytes: resources.reduce(
          (sum, entry) => sum + entry.encodedBytes!,
          0,
        ),
        decodedBytes: observed.resourceTiming.reduce(
          (sum, entry) => sum + entry.decodedBodySize,
          0,
        ),
        resources,
        resourceTiming: observed.resourceTiming,
      },
      observations: observed.observations,
    })
    this.currentPhase = null
    this.assertValid()
  }
  async navigation(
    name: string,
    action: () => Promise<unknown>,
    ready: Locator,
  ) {
    await this.begin(name, 'navigation')
    await action()
    await ready.waitFor({ state: 'visible' })
    await this.end()
  }
  async setup(
    name: string,
    action: () => Promise<unknown>,
    kind: Phase['kind'] = 'setup',
  ) {
    await this.begin(name, kind)
    await action()
    await this.end()
  }
  async activation(
    name: string,
    target: Locator | null,
    eventName: string,
    condition: Condition,
    action: () => Promise<unknown>,
  ) {
    await this.begin(name, 'activation')
    const targetSelector = target ? `[data-benchmark-input="${name}"]` : null
    if (target)
      await target.evaluate(
        (element, name) => element.setAttribute('data-benchmark-input', name),
        name,
      )
    await this.page.evaluate(
      ({ condition, eventName, targetSelector }) => {
        const state = window.__journeyBenchmark
        const armed: ArmedInput = {
          inputAt: null,
          completedAt: null,
          eventName,
          targetSelector,
          check: null,
        }
        state.armed = armed
        const matches = () => {
          let elements = [
            ...document.querySelectorAll<HTMLElement>(condition.selector),
          ]
          if (condition.mode === 'absent')
            return elements.every((element) => !element.checkVisibility())
          if (condition.mode === 'text')
            elements = elements.filter((element) =>
              element.textContent?.includes(condition.value!),
            )
          if (elements.length !== 1) return false
          const element = elements[0]
          if (condition.mode === 'focused')
            return document.activeElement === element
          if (condition.mode === 'value')
            return (element as HTMLInputElement).value === condition.value
          if (condition.mode === 'selection')
            return (
              window.getSelection()?.toString() === condition.value &&
              element.contains(window.getSelection()?.anchorNode ?? null)
            )
          return (
            element.checkVisibility() &&
            (condition.mode !== 'text' ||
              element.textContent?.includes(condition.value!))
          )
        }
        let scheduled = false
        const observer = new MutationObserver(() => check())
        const check = () => {
          if (state.armed !== armed || scheduled) return
          if (armed.inputAt !== null && matches()) {
            scheduled = true
            observer.disconnect()
            // DOM outcome observed, then the following animation frame.
            requestAnimationFrame(() => {
              armed.completedAt = performance.now()
            })
          }
        }
        armed.check = check
        observer.observe(document, {
          subtree: true,
          attributes: true,
          childList: true,
          characterData: true,
        })
        const frame = () => {
          check()
          if (!scheduled && state.armed === armed) requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      },
      { condition, eventName, targetSelector },
    )
    await action()
    await this.page.waitForFunction(
      () => window.__journeyBenchmark.armed?.completedAt != null,
      undefined,
      { timeout: 30_000 },
    )
    await this.end(true)
  }
  async screenshot(surface: string, locator: Locator) {
    await uniqueVisible(locator, surface)
    await locator.scrollIntoViewIfNeeded()
    const file = `${this.prefix}-${surface}.png`
    await this.page.screenshot({ path: join(this.output, file) })
    this.screenshots.push(file)
    this.assertValid()
  }
}
async function uniqueVisible(locator: Locator, label: string) {
  await locator.waitFor({ state: 'visible' })
  requireThat((await locator.count()) === 1, `Duplicate ${label} UI`)
}
async function focused(locator: Locator) {
  requireThat(
    await locator.evaluate((element) => element === document.activeElement),
    'Focus was not restored to the original trigger',
  )
}
async function selectedPhrase(page: Page, phrase: string) {
  const editor = page.getByRole('textbox', { name: 'Rich content editor' })
  await editor.focus()
  await editor.evaluate((element, phrase) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const start = node.textContent?.indexOf(phrase) ?? -1
      if (start < 0) continue
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + phrase.length)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return
    }
    throw new Error('Temporary editor phrase is missing')
  }, phrase)
  requireThat(
    await page.evaluate(
      (phrase) => window.getSelection()?.toString() === phrase,
      phrase,
    ),
    'Editor phrase selection was lost',
  )
}

async function runJourney(
  id: string,
  recorder: Recorder,
  run: number,
  profile: Profile,
  credentials: { email: string; password: string },
) {
  const page = recorder.page
  if (id === 'mobile-navigation') {
    const home = new HomePage(page)
    await recorder.navigation('navigation', () => home.open(), home.searchForm)
    await recorder.activation(
      'cold-open',
      home.mobileToggle,
      'click',
      { selector: 'dialog.mobile-navigation' },
      () => home.openMenu(),
    )
    await recorder.screenshot('menu', home.mobileDialog)
    await recorder.activation(
      'close',
      null,
      'keydown',
      { selector: '.site-header__mobile-toggle', mode: 'focused' },
      () => page.keyboard.press('Escape'),
    )
    await home.mobileDialog.waitFor({ state: 'hidden' })
    await focused(home.mobileToggle)
    await recorder.activation(
      'warm-open',
      home.mobileToggle,
      'click',
      { selector: 'dialog.mobile-navigation' },
      () => home.openMenu(),
    )
    await uniqueVisible(home.mobileDialog, 'menu')
    await recorder.setup('final-close', () => home.closeMenu())
    await focused(home.mobileToggle)
  } else if (id === 'gallery') {
    const gallery = page.locator('[data-island="Gallery"]')
    const trigger = gallery.locator('.gallery-grid__item').first()
    const dialog = page.locator('dialog.gallery-lightbox')
    await recorder.navigation(
      'navigation',
      () => page.goto('/hotels/casa-aurelia'),
      page.locator('main h1'),
    )
    await recorder.setup(
      'deferred-scroll',
      async () => {
        await gallery.scrollIntoViewIfNeeded()
        await uniqueVisible(gallery.locator('.gallery-grid'), 'gallery grid')
        await page.waitForLoadState('networkidle')
      },
      'deferred-loading',
    )
    await recorder.activation(
      'cold-open',
      trigger,
      'click',
      {
        selector: 'dialog.gallery-lightbox .gallery-lightbox__heading small',
        mode: 'text',
        value: '1 of 3',
      },
      () => trigger.click(),
    )
    await recorder.screenshot('gallery', dialog)
    const next = page.getByRole('button', { name: 'Next photo' })
    await recorder.activation(
      'next-photo',
      next,
      'click',
      {
        selector: '.gallery-lightbox__heading small',
        mode: 'text',
        value: '2 of 3',
      },
      () => next.click(),
    )
    await recorder.activation(
      'close',
      null,
      'keydown',
      { selector: '[data-benchmark-input="cold-open"]', mode: 'focused' },
      () => page.keyboard.press('Escape'),
    )
    await dialog.waitFor({ state: 'hidden' })
    await focused(trigger)
    await recorder.activation(
      'warm-open',
      trigger,
      'click',
      {
        selector: 'dialog.gallery-lightbox .gallery-lightbox__heading small',
        mode: 'text',
        value: '1 of 3',
      },
      () => trigger.click(),
    )
    await uniqueVisible(dialog, 'gallery dialog')
    await recorder.setup('final-close', () => page.keyboard.press('Escape'))
    await focused(trigger)
  } else if (id === 'inquiry-calendar') {
    const inquiry = new InquiryPage(page)
    const trigger = page.locator('#inquiry-check-in')
    const calendarSelector = '#inquiry-check-in-popover .date-picker-calendar'
    await recorder.navigation(
      'navigation',
      () => inquiry.gotoRoomInquiry(),
      inquiry.form,
    )
    const date = await page.evaluate(() => {
      const today = new Date()
      const target = new Date(today.getFullYear(), today.getMonth() + 1, 15)
      return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
    })
    await recorder.activation(
      'cold-open',
      trigger,
      'click',
      { selector: calendarSelector },
      () => inquiry.openCheckInCalendar(),
    )
    await recorder.screenshot('calendar', inquiry.calendar)
    const next = inquiry.calendar.getByRole('button', {
      name: 'Go to the Next Month',
      exact: false,
    })
    await recorder.activation(
      'next-month',
      next,
      'click',
      {
        selector: `${calendarSelector} [data-day="${date}"]:not([data-month]) button`,
      },
      () => next.click(),
    )
    const day = inquiry.calendar.locator(
      `[data-day="${date}"]:not([data-month]) button`,
    )
    requireThat(await day.isEnabled(), 'Future check-in day is disabled')
    await recorder.activation(
      'select-day',
      day,
      'click',
      { selector: 'input[name="checkIn"]', mode: 'value', value: date },
      () => day.click(),
    )
    await inquiry.calendar.waitFor({ state: 'hidden' })
    await focused(trigger)
    await recorder.activation(
      'warm-open',
      trigger,
      'click',
      { selector: calendarSelector },
      () => trigger.click(),
    )
    await uniqueVisible(inquiry.calendar, 'calendar')
    await recorder.setup('verify-retained-selection', async () => {
      requireThat(
        (await page.locator('input[name="checkIn"]').inputValue()) === date,
        'Reopening lost the selected check-in',
      )
      await inquiry.calendar
        .getByRole('button', { name: 'Go to the Next Month', exact: false })
        .click()
      await uniqueVisible(
        inquiry.calendar.locator(`[data-day="${date}"][data-selected="true"]`),
        'retained selected day',
      )
    })
    await recorder.setup('close-selected', () => inquiry.dismissCalendar())
    await focused(trigger)
    const checkout = page.locator('#inquiry-check-out')
    await recorder.activation(
      'checkout-open',
      checkout,
      'click',
      { selector: '#inquiry-check-out-popover .date-picker-calendar' },
      () => checkout.click(),
    )
    await recorder.setup('verify-checkout-bound', async () => {
      // Checkout opens on the current local month. Move to the selected next month.
      await inquiry.calendar
        .getByRole('button', { name: 'Go to the Next Month', exact: false })
        .click()
      const cells = inquiry.calendar.locator('[data-day]:not([data-month])')
      const bounds = await cells.evaluateAll(
        (elements, date) =>
          elements
            .filter((element) => element.getAttribute('data-day')! <= date)
            .map((element) => ({
              date: element.getAttribute('data-day'),
              disabled: element.getAttribute('data-disabled') === 'true',
              buttonDisabled: element.querySelector('button')?.disabled ?? true,
            })),
        date,
      )
      requireThat(
        bounds.some((bound) => bound.date === date) &&
          bounds.every((bound) => bound.disabled && bound.buttonDisabled),
        'Checkout allows a date at or before check-in',
      )
      await inquiry.dismissCalendar()
      await focused(checkout)
      await inquiry.fillContactDetails(
        'Benchmark Guest',
        'benchmark@example.test',
      )
    })
    let inquiryMutations = 0
    const mutation = (request: Request) => {
      if (
        new URL(request.url()).pathname === '/api/inquiries' &&
        request.method() !== 'GET'
      )
        inquiryMutations++
    }
    page.on('request', mutation)
    const submit = page.getByRole('button', { name: 'Send inquiry' })
    await recorder.activation(
      'invalid-submit',
      submit,
      'click',
      {
        selector: '#inquiry-checkOut-error',
        mode: 'text',
        value: 'Check-out must be after check-in.',
      },
      () => inquiry.submit(),
    )
    page.off('request', mutation)
    requireThat(
      inquiryMutations === 0 &&
        (await page.locator('.inquiry-page__success').count()) === 0,
      'Invalid inquiry caused an API mutation',
    )
    requireThat(
      (await page.locator('input[name="checkIn"]').inputValue()) === date &&
        (await page.locator('input[name="checkOut"]').inputValue()) === '',
      'Wrong submitted date values',
    )
  } else if (id === 'search') {
    const search = new SearchPage(page)
    await recorder.navigation(
      'navigation',
      () => search.open('/search?destination=amalfi-coast&rating=4.5'),
      search.heading,
    )
    const rating = page.getByRole('combobox', { name: 'Minimum rating' })
    // selectOption dispatches synthetic events. Use actual keyboard input for the
    // measured event timestamp, while keeping the existing page object for setup.
    await recorder.setup('focus-rating', () => rating.focus())
    await recorder.activation(
      'cold-rating-input',
      rating,
      'input',
      { selector: '#minimum-rating', mode: 'value', value: '4.7' },
      () => page.keyboard.press('4'),
    )
    const documents = recorder.documentCount
    await recorder.navigation(
      'apply-navigation',
      async () => {
        await Promise.all([
          page.waitForURL(/rating=4\.7/),
          search.applyFilters(),
        ])
      },
      search.heading,
    )
    requireThat(
      recorder.documentCount === documents + 1 &&
        new URL(page.url()).searchParams.get('rating') === '4.7',
      'Search did not perform the expected document navigation',
    )
    await uniqueVisible(search.heading, 'search results heading')
    // Search submits a live document, so this is repeat-input (not warm module reuse).
    await recorder.setup('reset-rating', async () => {
      await search.setMinimumRating('4.5')
      await rating.focus()
    })
    await recorder.activation(
      'repeat-rating-input',
      rating,
      'input',
      { selector: '#minimum-rating', mode: 'value', value: '4.7' },
      () => page.keyboard.press('4'),
    )
    await recorder.navigation(
      'repeat-apply-navigation',
      async () => {
        await Promise.all([
          page.waitForEvent('domcontentloaded'),
          search.applyFilters(),
        ])
      },
      search.heading,
    )
    await uniqueVisible(search.heading, 'search results heading')
    requireThat(
      new URL(page.url()).searchParams.get('rating') === '4.7',
      'Wrong repeat search value',
    )
  } else if (id === 'admin-control') {
    const admin = new AdminPage(page)
    await recorder.navigation(
      'login-navigation',
      () => admin.openLogin(),
      page.getByRole('button', { name: 'Sign in' }),
    )
    // Authentication is excluded from editor/router interaction metrics and screenshots.
    await recorder.navigation(
      'login',
      () => admin.signIn(credentials.email, credentials.password),
      admin.dashboardStats,
    )
    const documents = recorder.documentCount
    await recorder.activation(
      'hotels',
      page
        .getByRole('navigation', { name: 'Admin navigation' })
        .getByRole('link', { name: 'Hotels' }),
      'click',
      { selector: '.admin-shell__header h1', mode: 'text', value: 'Hotels' },
      () => admin.openHotels(),
    )
    await recorder.activation(
      'edit-hotel',
      admin.tableRows.first().getByRole('button', { name: 'Edit' }),
      'click',
      { selector: '.admin-content-form' },
      () => admin.editFirstHotel(),
    )
    const hotelUrl = page.url()
    const savedForm = await admin.editorForm
      .locator('form')
      .evaluate((form) =>
        [...new FormData(form as HTMLFormElement)].map(([name, value]) => [
          name,
          typeof value === 'string' ? value : value.name,
        ]),
      )
    await recorder.setup('back-forward', async () => {
      await page.goBack()
      await admin.tableRows.first().waitFor({ state: 'visible' })
      requireThat(
        (await admin.sectionHeading.textContent()) === 'Hotels',
        'Admin Back failed',
      )
      await page.goForward()
      await admin.editorForm.waitFor({ state: 'visible' })
      requireThat(
        page.url() === hotelUrl,
        'Admin Forward restored the wrong route',
      )
      const restored = await admin.editorForm
        .locator('form')
        .evaluate((form) =>
          [...new FormData(form as HTMLFormElement)].map(([name, value]) => [
            name,
            typeof value === 'string' ? value : value.name,
          ]),
        )
      requireThat(
        JSON.stringify(restored) === JSON.stringify(savedForm),
        'Admin Forward did not restore the form',
      )
    })
    await recorder.setup('open-post', async () => {
      const [response] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === '/api/admin/posts' &&
            response.request().method() === 'GET',
        ),
        page
          .getByRole('navigation', { name: 'Admin navigation' })
          .getByRole('link', { name: 'Journal posts', exact: true })
          .click(),
      ])
      requireThat(response.ok(), 'Admin posts listing failed')
      const rows = z
        .array(z.object({ id: z.string(), slug: z.string() }))
        .parse(await response.json())
      const post = rows.find((row) => row.id === 'post-1')
      requireThat(post, 'Required fixture post-1 is missing')
      await admin.tableRows
        .filter({ has: page.locator('td', { hasText: post.slug }) })
        .getByRole('button', { name: 'Edit' })
        .click()
      await page
        .getByRole('textbox', { name: 'Rich content editor' })
        .waitFor({ state: 'visible' })
      requireThat(
        new URL(page.url()).pathname === '/admin/posts/post-1',
        'Wrong admin post opened',
      )
    })
    const editor = page.getByRole('textbox', { name: 'Rich content editor' })
    const phrase = `Benchmark temporary ${profile.id} ${run}`
    await recorder.setup('editor-position', async () => {
      await editor.click()
      await page.keyboard.press(
        process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End',
      )
      await page.keyboard.press('Enter')
      const bold = page.getByRole('button', { name: 'Bold', exact: true })
      if ((await bold.getAttribute('aria-pressed')) === 'true')
        await bold.click()
    })
    await recorder.activation(
      'editor-input',
      editor,
      'input',
      { selector: '.tiptap-editor', mode: 'text', value: phrase },
      () => page.keyboard.insertText(phrase),
    )
    await recorder.setup('editor-select', () => selectedPhrase(page, phrase))
    const bold = page.getByRole('button', { name: 'Bold', exact: true })
    await recorder.activation(
      'cold-bold',
      bold,
      'click',
      { selector: '.tiptap-editor strong', mode: 'text', value: phrase },
      () => bold.click(),
    )
    requireThat(
      await page.evaluate(
        (phrase) =>
          window.getSelection()?.toString() === phrase &&
          document.activeElement?.getAttribute('aria-label') ===
            'Rich content editor',
        phrase,
      ),
      'Bold lost editor focus or selection',
    )
    await recorder.screenshot('editor', editor)
    await recorder.setup('remove-bold', async () => {
      await bold.click()
      await selectedPhrase(page, phrase)
    })
    await recorder.activation(
      'warm-bold',
      bold,
      'click',
      { selector: '.tiptap-editor strong', mode: 'text', value: phrase },
      () => bold.click(),
    )
    requireThat(
      await page.evaluate(
        (phrase) =>
          window.getSelection()?.toString() === phrase &&
          document.activeElement?.getAttribute('aria-label') ===
            'Rich content editor',
        phrase,
      ),
      'Warm Bold lost editor focus or selection',
    )
    requireThat(
      recorder.documentCount === documents,
      'Admin performed a document navigation after login',
    )
    await recorder.navigation(
      'logout',
      async () => {
        await admin.signOut()
        await page.waitForURL(/\/admin\/login$/)
      },
      page.getByRole('button', { name: 'Sign in' }),
    )
  } else throw new Error('Unknown benchmark journey')
  recorder.assertValid()
}
function phaseMetrics(phase: Phase) {
  const eventsUnavailable = !!phase.observations.unsupported.event
  return {
    inputToNextFrameMs: phase.inputToNextFrameMs,
    durationMs: phase.durationMs,
    encodedBytes: phase.network.encodedBytes,
    decodedBytes: phase.network.decodedBytes,
    requestCount: phase.network.requests,
    resourceTransferBytes: phase.network.resourceTiming.reduce(
      (sum, entry) => sum + entry.transferSize,
      0,
    ),
    resourceEncodedBodyBytes: phase.network.resourceTiming.reduce(
      (sum, entry) => sum + entry.encodedBodySize,
      0,
    ),
    eventDurationMaxMs: eventsUnavailable
      ? null
      : Math.max(
          0,
          ...phase.observations.events.map((entry) => entry.duration),
        ),
    longTaskCount: phase.observations.longTasks.count,
    longTaskTotalMs: phase.observations.longTasks.totalMs,
    longTaskMaxMs: phase.observations.longTasks.maxMs,
    layoutShiftWithInput: phase.observations.layoutShifts.withRecentInput,
    layoutShiftWithoutInput: phase.observations.layoutShifts.withoutRecentInput,
    ...(phase.navigationTiming
      ? {
          navigationDurationMs: phase.navigationTiming.durationMs,
          navigationResponseEndMs: phase.navigationTiming.responseEndMs,
          navigationDomContentLoadedMs:
            phase.navigationTiming.domContentLoadedMs,
          navigationLoadEventMs: phase.navigationTiming.loadEventMs,
        }
      : {}),
  }
}
function aggregate(samples: Sample[]) {
  const result: {
    journey: string
    profile: string
    runs: number
    metrics: Record<string, Record<string, MetricSummary>>
  }[] = []
  for (const journey of journeys)
    for (const profile of journey.profiles) {
      const matching = samples.filter(
        (sample) => sample.journey === journey.id && sample.profile === profile,
      )
      const metrics: Record<string, Record<string, MetricSummary>> = {}
      for (const [phaseName, values] of Object.entries(
        matching[0].metrics.phases,
      )) {
        metrics[phaseName] = {}
        for (const key of Object.keys(values)) {
          const numbers = matching
            .map((sample) => sample.metrics.phases[phaseName][key])
            .filter((value) => value !== null)
            .sort((a, b) => a - b)
          const middle = Math.floor(numbers.length / 2)
          metrics[phaseName][key] = {
            count: numbers.length,
            missing: matching.length - numbers.length,
            median: numbers.length
              ? numbers.length % 2
                ? numbers[middle]
                : (numbers[middle - 1] + numbers[middle]) / 2
              : null,
            min: numbers.length ? numbers[0] : null,
            max: numbers.length ? numbers[numbers.length - 1] : null,
          }
        }
      }
      result.push({
        journey: journey.id,
        profile,
        runs: matching.length,
        metrics,
      })
    }
  return result
}
async function main() {
  const options = args()
  await mkdir(options.output, { recursive: true })
  requireThat(
    (await readdir(options.output)).length === 0,
    'Refusing a nonempty benchmark output directory',
  )
  // Reserve the directory even when prerequisites or a run subsequently fail.
  await writeFile(
    join(options.output, 'run-status.json'),
    JSON.stringify({ status: 'running' }, null, 2),
  )
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  let browser: Browser | undefined
  const samples: Sample[] = []
  let active: { journey: string; profile: string; run: number } | null = null
  let activeRecorder: Recorder | undefined
  try {
    requireThat(
      process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD,
      'Export approved ADMIN_EMAIL and ADMIN_PASSWORD; authenticated control cannot be skipped',
    )
    const credentials = {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }
    const assetDirectory = join(root, 'apps/web/wwwroot/assets')
    const entrySchema = z.object({
      file: z.string().min(1),
      isEntry: z.literal(true),
    })
    const manifest = z
      .object({
        'src/islands/runtime.tsx': entrySchema,
        'src/admin/main.tsx': entrySchema,
      })
      .parse(
        JSON.parse(
          await readFile(join(assetDirectory, 'manifest.json'), 'utf8'),
        ),
      )
    for (const entry of Object.values(manifest)) {
      requireThat(
        entry.file.startsWith('assets/') &&
          !entry.file.split('/').includes('..') &&
          !/[\\?#]/.test(entry.file) &&
          entry.file.endsWith('.js'),
        'Malformed manifest entry file',
      )
      await readFile(join(assetDirectory, entry.file))
    }
    const environment = {
      sourceRevision: command('git', ['rev-parse', 'HEAD'], root),
      lockfileSha256: await hash(join(root, 'pnpm-lock.yaml')),
      manifestSha256: await hash(
        join(root, 'apps/web/wwwroot/assets/manifest.json'),
      ),
      os: {
        platform: platform(),
        release: release(),
        arch: arch(),
        cpu: cpus()[0]?.model ?? null,
        memoryBytes: totalmem(),
      },
      nodeVersion: process.version,
      pnpmVersion: command('pnpm', ['--version'], root),
      dotnetVersion: command('dotnet', ['--version'], root),
      fixtureId: process.env.BENCHMARK_FIXTURE_ID ?? null,
    }
    // Explicit path avoids silently measuring Playwright's alternate headless shell.
    browser = await chromium.launch({
      headless: true,
      executablePath: chromium.executablePath(),
    })
    const inputs = {
      origin: options.origin,
      protocol: new URL(options.origin).protocol,
      runs: options.runs,
      browser: {
        name: 'chromium',
        version: browser.version(),
        executable: chromium.executablePath(),
      },
      profiles,
      journeys,
      omissions: [
        {
          journey: 'mobile-navigation',
          profile: 'desktop',
          reason:
            'Mobile-only menu journey; desktop navigation does not expose this dialog',
        },
      ],
      instrumentation: {
        version: 1,
        eventTimingDurationThreshold: 16,
        cacheDisabled: true,
        contexts: 'fresh-per-journey-profile-run',
        execution: 'serial',
        serialization:
          'tsx/esbuild keepNames helper installed before serialized browser instrumentation',
        timing:
          'trusted browser input event timestamp to expected DOM state plus following requestAnimationFrame; not INP',
        network:
          'CDP loadingFinished encodedDataLength; Resource Timing decoded/encoded/transfer sizes reported separately',
        phaseDuration:
          'browser performance.now collection window includes network settling and 100ms observer delivery; not input latency',
        warmActions:
          'same-context close/reopen menu, gallery, calendar; remove/reapply editor Bold; search repeat input occurs after full document navigation and is not warm module reuse',
      },
    }
    for (const journey of journeys)
      for (const profile of profiles) {
        if (!journey.profiles.includes(profile.id)) continue
        for (let run = 1; run <= options.runs; run++) {
          active = { journey: journey.id, profile: profile.id, run }
          let context: BrowserContext | undefined
          let cdp: CDPSession | undefined
          try {
            context = await browser.newContext({
              baseURL: options.origin,
              viewport: profile.viewport,
              isMobile: profile.isMobile,
              hasTouch: profile.hasTouch,
              deviceScaleFactor: 1,
              serviceWorkers: 'block',
            })
            // tsx uses esbuild keepNames: serialized callbacks may reference __name.
            // Keep its descriptor behavior, and install it in the same init script
            // before observer setup (separate init script ordering is unspecified).
            await context.addInitScript({
              content:
                'Object.defineProperty(globalThis, "__name", { value: (target, value) => Object.defineProperty(target, "name", { value, configurable: true }), configurable: true });' +
                `(${installObservers.toString()})();`,
            })
            const page = await context.newPage()
            page.setDefaultTimeout(30_000)
            page.setDefaultNavigationTimeout(60_000)
            cdp = await context.newCDPSession(page)
            const recorder = new Recorder(
              page,
              cdp,
              options.output,
              `${journey.id}-${profile.id}-${String(run).padStart(2, '0')}`,
            )
            activeRecorder = recorder
            await cdp.send('Network.enable')
            await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
            await cdp.send('Emulation.setCPUThrottlingRate', {
              rate: profile.cpuSlowdown,
            })
            if (profile.network)
              await cdp.send('Network.emulateNetworkConditions', {
                offline: false,
                ...profile.network,
              })
            await runJourney(journey.id, recorder, run, profile, credentials)
            const metrics = {
              phases: Object.fromEntries(
                recorder.phases.map((phase) => [
                  phase.name,
                  phaseMetrics(phase),
                ]),
              ),
            }
            const sample = {
              ...active,
              metrics,
              phases: recorder.phases,
              screenshots: recorder.screenshots,
              snapshotVersions: [...new Set(recorder.snapshotVersions)],
            }
            samples.push(sample)
            // Preserve completed raw samples on any later failure; never mark them a complete run.
            await writeFile(
              join(options.output, 'partial-samples.json'),
              JSON.stringify(
                { schemaVersion: 1, inputs, environment, samples },
                null,
                2,
              ),
            )
            console.log(
              `Completed ${samples.length} samples: ${active.journey}/${active.profile}/${active.run}`,
            )
          } finally {
            try {
              await cdp?.detach()
            } finally {
              await context?.close()
            }
          }
        }
      }
    requireThat(
      samples.length ===
        journeys.reduce(
          (sum, journey) => sum + journey.profiles.length * options.runs,
          0,
        ),
      'Incomplete benchmark runs',
    )
    const report = {
      schemaVersion: 1,
      inputs,
      environment,
      samples,
      aggregates: aggregate(samples),
    }
    await writeFile(
      join(options.output, 'journeys.json'),
      JSON.stringify(report, null, 2),
    )
    await writeFile(
      join(options.output, 'run-status.json'),
      JSON.stringify(
        { status: 'complete', sampleCount: samples.length },
        null,
        2,
      ),
    )
    console.log(
      `Saved ${samples.length} serial journey samples to ${join(options.output, 'journeys.json')}`,
    )
  } catch (error: unknown) {
    // Browser/server exception text can contain credentials, CSRF tokens, or URLs.
    // Only our fixed assertions are safe to retain; never serialize raw exceptions.
    const reason =
      error instanceof BenchmarkError
        ? error.message
        : 'A prerequisite, browser action, or artifact write failed; raw exception details suppressed to protect credentials'
    await writeFile(
      join(options.output, 'run-status.json'),
      JSON.stringify(
        {
          status: 'failed',
          active,
          phase: activeRecorder?.currentPhase ?? null,
          completedSamples: samples.length,
          reason,
        },
        null,
        2,
      ),
    )
    throw new BenchmarkError(
      `Benchmark failed${active ? ` at ${active.journey}/${active.profile}/${active.run}` : ' during prerequisites'}: ${reason}; retained failed artifacts in the requested directory`,
    )
  } finally {
    await browser?.close()
  }
}
main().catch((error: unknown) => {
  // Argument errors contain only fixed usage text; run errors are sanitized above.
  console.error(
    error instanceof BenchmarkError
      ? error.message
      : 'Invalid benchmark arguments or prerequisite (raw exception details suppressed)',
  )
  process.exitCode = 1
})

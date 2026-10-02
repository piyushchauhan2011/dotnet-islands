import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { HomePage } from './pages/home'

async function readManifest() {
  return JSON.parse(
    await readFile(
      new URL('../../apps/web/wwwroot/assets/manifest.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, { file: string }>
}

async function holdRuntime(page: Page, runtimeUrl: string) {
  let release!: () => void
  let requested = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    (url) => url.href === runtimeUrl,
    async (route) => {
      requested = true
      await gate
      await route.continue()
    },
  )
  return { release, wasRequested: () => requested }
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      /hydrat|did not match|server rendered/i.test(message.text())
    )
      errors.push(message.text())
  })
  page.on('requestfailed', (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  )
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()}: ${response.url()}`)
  })
  return errors
}

test('published gallery retains its DOM through deferred hydration and repeated lightbox use', async ({
  page,
  baseURL,
}) => {
  const manifest = await readManifest()
  const runtimePath = `/assets/${manifest['src/islands/runtime.tsx'].file}`
  const galleryUrl = new URL(
    `/assets/${manifest['src/islands/Gallery.tsx'].file}`,
    baseURL,
  ).href
  const galleryRequests: string[] = []
  page.on('request', (request) => {
    if (request.url() === galleryUrl) galleryRequests.push(request.url())
  })
  const errors = collectBrowserErrors(page)
  const runtime = await holdRuntime(page, new URL(runtimePath, baseURL).href)
  try {
    const response = await page.goto('/hotels/casa-aurelia', {
      waitUntil: 'commit',
    })
    expect(response?.status()).toBe(200)
    expect(response?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
    await expect(page.locator('main h1')).toHaveText('Casa Aurelia')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/hotels\/casa-aurelia$/,
    )
    await expect(page.locator('script[type="module"][src]')).toHaveCount(1)
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
      'src',
      runtimePath,
    )
    await expect.poll(runtime.wasRequested).toBe(true)
    await expect(page.locator('[data-fallback-for]')).toHaveCount(0)
    await expect(page.locator('[data-island="MobileNav"] button')).toHaveCount(
      1,
    )
    const gallery = page.locator('[data-island="Gallery"]')
    const grid = gallery.locator('.gallery-grid')
    const trigger = gallery.getByRole('button', {
      name: 'Open Casa Aurelia gallery image 1 — property',
      exact: true,
    })
    const allPhotos = gallery.getByRole('button', {
      name: 'View all 3 photos',
      exact: true,
    })
    await expect(gallery).toHaveAttribute('data-hydrate', 'visible')
    await expect(grid).toHaveCount(1)
    await expect(grid).toHaveCSS('display', 'grid')
    await expect(allPhotos).toHaveText('View all 3 photos')
    const serverNodes = await gallery.evaluateHandle((marker) => ({
      marker,
      grid: marker.querySelector('.gallery-grid'),
      trigger: marker.querySelector('.gallery-grid__item'),
      image: marker.querySelector('.gallery-grid__image'),
      allPhotos: marker.querySelector('.gallery-grid__all'),
    }))
    try {
      // Start outside the real observer margin, then scroll the published gallery into view.
      await expect(page.locator('.site-footer')).toBeAttached()
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      )
      await expect
        .poll(() =>
          gallery.evaluate((marker) => marker.getBoundingClientRect().bottom),
        )
        .toBeLessThan(-200)
      runtime.release()
      await page.waitForLoadState('load')
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      expect(galleryRequests).toEqual([])
      const loadedGallery = page.waitForResponse(galleryUrl)
      await grid.scrollIntoViewIfNeeded()
      const galleryResponse = await loadedGallery
      expect(galleryResponse.ok()).toBe(true)
      await galleryResponse.finished()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      const lightbox = page.locator('dialog.gallery-lightbox')
      const counter = lightbox.locator('.gallery-lightbox__heading small')
      for (let cycle = 0; cycle < 3; cycle++) {
        await trigger.focus()
        await trigger.click()
        await expect(lightbox).toHaveCount(1)
        await expect(lightbox).toBeVisible()
        await expect(counter).toHaveText('1 of 3')
        await lightbox.getByRole('button', { name: 'Next photo' }).click()
        await expect(counter).toHaveText('2 of 3')
        await page.keyboard.press('ArrowRight')
        await expect(counter).toHaveText('3 of 3')
        await page.keyboard.press('ArrowLeft')
        await expect(counter).toHaveText('2 of 3')
        await page.keyboard.press('Escape')
        await expect(lightbox).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await expect(grid).toHaveCount(1)
        await expect(allPhotos).toHaveText('View all 3 photos')
      }
      expect(galleryRequests).toEqual([galleryUrl])
      expect(
        await serverNodes.evaluate((nodes) => ({
          marker:
            nodes.marker === document.querySelector('[data-island="Gallery"]'),
          grid: nodes.grid === nodes.marker.querySelector('.gallery-grid'),
          trigger:
            nodes.trigger === nodes.marker.querySelector('.gallery-grid__item'),
          image:
            nodes.image === nodes.marker.querySelector('.gallery-grid__image'),
          allPhotos:
            nodes.allPhotos ===
            nodes.marker.querySelector('.gallery-grid__all'),
        })),
      ).toEqual({
        marker: true,
        grid: true,
        trigger: true,
        image: true,
        allPhotos: true,
      })
      expect(errors).toEqual([])
    } finally {
      await serverNodes.dispose()
    }
  } finally {
    runtime.release()
  }
})

test('published search form hydrates in place with intact adjacent text and date behavior', async ({
  page,
  baseURL,
}) => {
  const manifest = await readManifest()
  const runtimePath = `/assets/${manifest['src/islands/runtime.tsx'].file}`
  const errors = collectBrowserErrors(page)
  const runtime = await holdRuntime(page, new URL(runtimePath, baseURL).href)
  try {
    const response = await page.goto('/', { waitUntil: 'commit' })
    expect(response?.status()).toBe(200)
    expect(response?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
    const home = new HomePage(page)
    await expect(home.searchForm).toBeVisible()
    await expect(home.searchForm).toHaveCount(1)
    await expect(page.locator('[data-fallback-for]')).toHaveCount(0)
    await expect(page.locator('script[type="module"][src]')).toHaveCount(1)
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
      'src',
      runtimePath,
    )
    await expect.poll(runtime.wasRequested).toBe(true)
    const adults = home.searchForm.locator('select[name="adults"]')
    await expect(adults.locator('option[value="1"]')).toHaveText('1 adult')
    await expect(adults.locator('option[value="2"]')).toHaveText('2 adults')
    const serverNodes = await home.searchForm.evaluateHandle((form) => ({
      marker: form.parentElement,
      form,
      destination: form.querySelector('select[name="destination"]'),
      adults: form.querySelector('select[name="adults"]'),
      checkIn: form.querySelector('#search-check-in'),
      checkInValue: form.querySelector('input[name="checkIn"]'),
    }))
    try {
      const loadedSearch = page.waitForResponse(
        new URL(
          `/assets/${manifest['src/islands/SearchForm.tsx'].file}`,
          baseURL,
        ).href,
      )
      runtime.release()
      await page.waitForLoadState('load')
      const searchResponse = await loadedSearch
      expect(searchResponse.ok()).toBe(true)
      await searchResponse.finished()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      const checkIn = home.searchForm.getByRole('button', {
        name: 'Check in',
        exact: true,
      })
      await checkIn.click()
      const calendar = page.getByRole('dialog', { name: 'Add date calendar' })
      await expect(calendar).toBeVisible()
      const date = await page.evaluate(() => {
        const nextMonth = new Date()
        nextMonth.setDate(15)
        nextMonth.setMonth(nextMonth.getMonth() + 1)
        return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-15`
      })
      await calendar
        .getByRole('button', { name: 'Go to the Next Month' })
        .click()
      await calendar
        .locator(`[data-day="${date}"]:not([data-month]) button`)
        .press('Enter')
      await expect(calendar).toHaveCount(0)
      await expect(checkIn).toBeFocused()
      await expect(
        home.searchForm.locator('input[name="checkIn"]'),
      ).toHaveValue(date)
      await adults.selectOption('3')
      await expect(adults).toHaveValue('3')
      await expect(adults.locator('option[value="1"]')).toHaveText('1 adult')
      await expect(adults.locator('option[value="2"]')).toHaveText('2 adults')
      await expect(adults.locator('option[value="3"]')).toHaveText('3 adults')
      await expect(home.searchForm).toHaveCount(1)
      expect(
        await serverNodes.evaluate((nodes) => ({
          marker:
            nodes.marker ===
            document.querySelector('[data-island="SearchForm"]'),
          form: nodes.form === nodes.marker?.querySelector('form'),
          destination:
            nodes.destination ===
            nodes.form.querySelector('select[name="destination"]'),
          adults:
            nodes.adults === nodes.form.querySelector('select[name="adults"]'),
          checkIn:
            nodes.checkIn === nodes.form.querySelector('#search-check-in'),
          checkInValue:
            nodes.checkInValue ===
            nodes.form.querySelector('input[name="checkIn"]'),
        })),
      ).toEqual({
        marker: true,
        form: true,
        destination: true,
        adults: true,
        checkIn: true,
        checkInValue: true,
      })
      expect(errors).toEqual([])
    } finally {
      await serverNodes.dispose()
    }
  } finally {
    runtime.release()
  }
})

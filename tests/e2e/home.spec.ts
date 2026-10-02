import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { DestinationPage } from './pages/destination'
import { HomePage } from './pages/home'

test('home page fetches the mobile dialog only after opening the menu', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  const manifest = JSON.parse(
    await readFile(
      new URL('../../apps/web/wwwroot/assets/manifest.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, { file: string }>
  const dialogUrl = new URL(
    `/assets/${manifest['src/islands/IslandDialog.tsx'].file}`,
    baseURL,
  ).href
  const dialogRequests: string[] = []
  let releaseDialog!: () => void
  const dialogGate = new Promise<void>((resolve) => {
    releaseDialog = resolve
  })
  await page.route(
    (url) => url.href === dialogUrl,
    async (route) => {
      dialogRequests.push(route.request().url())
      await dialogGate
      await route.continue()
    },
  )
  try {
    const home = new HomePage(page)
    await home.open()
    await expect(home.searchForm).toBeVisible()
    await expect(home.mobileDialog).toHaveCount(0)
    expect(dialogRequests).toEqual([])

    const menu = page.getByRole('button', { name: 'Open navigation' })
    await home.openMenu()
    await expect.poll(() => dialogRequests).toEqual([dialogUrl])
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(home.mobileDialog).toHaveCount(0)
    releaseDialog()
    await expect(home.mobileDialog).toHaveCount(1)
    await expect(home.mobileDialog).toBeVisible()
    await home.closeMenu()
    await expect(home.mobileDialog).not.toBeVisible()
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(menu).toBeFocused()

    await home.openMenu()
    await expect(home.mobileDialog).toHaveCount(1)
    await expect(home.mobileDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(home.mobileDialog).not.toBeVisible()
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(menu).toBeFocused()

    await home.openMenu()
    await expect(home.mobileDialog).toHaveCount(1)
    await expect(home.mobileDialog).toBeVisible()
    await home.closeMenu()
    await expect(home.mobileDialog).not.toBeVisible()
    await expect(menu).toBeFocused()
    expect(dialogRequests).toEqual([dialogUrl])
  } finally {
    releaseDialog()
  }
})

test('home cards fill their frames and the overlay header gains contrast after scroll', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1568, height: 900 })
  const home = new HomePage(page)
  await home.open()
  const header = home.header
  await expect(home.mobileToggle).toBeHidden()
  await expect(header).toHaveClass(/site-header--overlay/)
  const card = home.firstDestinationCard
  const image = card.locator('img')
  await expect(image).toHaveCSS('object-fit', 'cover')
  const frame = await card
    .locator('.destination-card__image-wrap')
    .boundingBox()
  const imageBounds = await image.boundingBox()
  expect(imageBounds!.width).toBeGreaterThan(frame!.width * 0.95)
  expect(imageBounds!.height).toBeGreaterThan(frame!.height * 0.95)
  await card.scrollIntoViewIfNeeded()
  const deliveredImage = await image.evaluate(
    (node: HTMLImageElement) => node.currentSrc,
  )
  expect(new URL(deliveredImage).pathname).toMatch(
    /^\/images\/gen\/.+\.[a-f0-9]{8}\.avif$/,
  )
  const imageResponse = await request.get(deliveredImage)
  expect(imageResponse.headers()['cache-control']).toBe(
    'public, max-age=31536000, immutable',
  )
  await expect(header).toHaveClass(/site-header--solid/)
  await expect(page.locator('.site-header__search-button')).toHaveClass(
    /is-primary/,
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(header).toHaveClass(/site-header--overlay/)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileToggle = home.mobileToggle
  await expect(mobileToggle).toBeVisible()
  await expect(mobileToggle).toHaveCSS('color', 'rgb(255, 255, 255)')
  await page.locator('.home-page__hotels').scrollIntoViewIfNeeded()
  await expect(header).toHaveClass(/site-header--solid/)
  await expect(mobileToggle).toHaveCSS('color', 'rgb(29, 41, 38)')
})

test('destination index lays out its cards in desktop columns and mobile rows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1568, height: 900 })
  const destination = new DestinationPage(page)
  await destination.open()
  await expect(page.locator('main .eyebrow').first()).toHaveText('FIELD GUIDES')
  await expect(page.locator('main h1')).toContainText('Places worth')
  await expect(page.locator('main h1')).toContainText('knowing slowly.')
  const cards = destination.cards
  const first = await cards.nth(0).boundingBox()
  const second = await cards.nth(1).boundingBox()
  const third = await cards.nth(2).boundingBox()
  expect(first!.x).toBeLessThan(second!.x)
  expect(second!.x).toBeLessThan(third!.x)
  expect(first!.width).toBeLessThan(500)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileFirst = await cards.nth(0).boundingBox()
  const mobileSecond = await cards.nth(1).boundingBox()
  expect(mobileSecond!.x).toBe(mobileFirst!.x)
  expect(mobileSecond!.y).toBeGreaterThan(mobileFirst!.y + mobileFirst!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
})

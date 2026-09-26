import { expect, test } from '@playwright/test'
import { AdminPage } from './pages/admin'
import { JournalPage } from './pages/journal'
import { SearchPage } from './pages/search'

test('search results occupy two columns beside filters and sort without overlapping footer', async ({
  page,
}) => {
  const search = new SearchPage(page)
  await page.setViewportSize({ width: 1568, height: 900 })
  await search.open()
  const cards = search.cards
  await expect(cards).toHaveCount(9)
  const filterPanel = search.filterPanel
  await expect(filterPanel).toBeVisible()
  const filters = await filterPanel.boundingBox()
  const first = await cards.first().boundingBox()
  const second = await cards.nth(1).boundingBox()
  const last = await cards.last().boundingBox()
  const footer = await search.footer.boundingBox()
  expect(filters!.x + filters!.width).toBeLessThan(first!.x)
  expect(second!.x).toBeGreaterThan(first!.x)
  expect(second!.y).toBe(first!.y)
  expect(footer!.y).toBeGreaterThan(last!.y + last!.height)
  await search.sortBy('price-asc')
  await expect(page).toHaveURL(/sort=price-asc/)
  const firstHotel = await search.firstHotelTitle.innerText()
  await search.goToResultsPage('2')
  await expect(page).toHaveURL(/page=2/)
  expect(await search.firstHotelTitle.innerText()).not.toBe(firstHotel)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileFirst = await cards.first().boundingBox()
  const mobileSecond = await cards.nth(1).boundingBox()
  expect(mobileSecond!.y).toBeGreaterThan(mobileFirst!.y + mobileFirst!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
})

test('sort remains usable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    const search = new SearchPage(page)
    await search.open(`${baseURL}/search?destination=amalfi-coast`)
    await expect(search.cards.first()).toBeVisible()
    await search.sortBy('price-asc')
    await search.submitSort()
    await expect(page).toHaveURL(/sort=price-asc/)
  } finally {
    await context.close()
  }
})

test('journal cards and stories keep editorial layouts on desktop and mobile', async ({
  page,
}) => {
  const journal = new JournalPage(page)
  await page.setViewportSize({ width: 1568, height: 900 })
  const listing = await journal.openListing()
  expect(listing?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
  await expect(journal.listingHeading).toContainText('Stories for going well.')
  const cards = journal.cards
  const featured = cards.first()
  const image = await featured.locator('img').boundingBox()
  const copy = await featured.locator('.blog-page__card-content').boundingBox()
  const second = await cards.nth(1).boundingBox()
  const third = await cards.nth(2).boundingBox()
  expect(copy!.x).toBeGreaterThanOrEqual(image!.x + image!.width)
  expect(second!.x).toBeLessThan(third!.x)
  expect(second!.y).toBe(third!.y)
  await expect(featured.locator('p')).toBeVisible()
  const excerptContrast = await cards.nth(1).evaluate((card) => {
    const text = card.querySelector('.blog-page__card-content p')!
    const background = card.querySelector('a')!
    const luminance = (color: string) => {
      const [red, green, blue] = color
        .match(/\d+/g)!
        .slice(0, 3)
        .map((value) => {
          const channel = Number(value) / 255
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4
        })
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }
    const foreground = luminance(getComputedStyle(text).color)
    const backdrop = luminance(getComputedStyle(background).backgroundColor)
    return (
      (Math.max(foreground, backdrop) + 0.05) /
      (Math.min(foreground, backdrop) + 0.05)
    )
  })
  expect(excerptContrast).toBeGreaterThanOrEqual(4.5)

  await journal.openFeaturedStory()
  await expect(page).toHaveURL(/\/blog\/the-art-of-the-unhurried-arrival$/)
  await expect(journal.postHeading).toHaveText(
    'The art of the unhurried arrival',
  )
  const hero = await journal.hero.boundingBox()
  expect(hero!.width).toBe(1568)
  await expect(journal.relatedHotel).toBeVisible()
  await expect(journal.backToStories).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileHero = await journal.hero.boundingBox()
  expect(mobileHero!.width).toBe(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await journal.returnToListing()
  const mobileImage = await cards.first().locator('img').boundingBox()
  const mobileCopy = await cards
    .first()
    .locator('.blog-page__card-content')
    .boundingBox()
  expect(mobileCopy!.y).toBeGreaterThan(mobileImage!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
})

test('filtered search is dynamic and deliberately non-indexable', async ({
  page,
}) => {
  const search = new SearchPage(page)
  const response = await search.open(
    '/search?destination=amalfi-coast&rating=4.5',
  )
  expect(response?.status()).toBe(200)
  expect(response?.headers()['x-snapshot-version']).toBeUndefined()
  expect(response?.headers()['cache-control']).toBe('private, no-store')
  await expect(search.robots).toHaveAttribute('content', 'noindex,follow')
  await expect(search.filterForm).toBeVisible()
  await search.setMinimumRating('4.7')
  await search.applyFilters()
  await expect(page).toHaveURL(/rating=4\.7/)
  await expect(search.heading).toHaveCount(1)
})

test('admin and internal snapshot source refuse anonymous access', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  const admin = new AdminPage(page)
  await admin.openAdmin()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(admin.robots).toHaveAttribute('content', 'noindex,nofollow')
  await expect(admin.siteHeader).toBeVisible()
  await expect(admin.siteFooter).toBeVisible()
  await expect(admin.welcomeHeading).toHaveText('Welcome back.')
  await expect(admin.main).toHaveCount(1)
  await expect(admin.canonical).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileMenu = admin.mobileMenu
  await expect(mobileMenu).toBeVisible()
  await admin.openMobileMenu()
  await expect(mobileMenu.getByRole('link', { name: 'Journal' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  expect((await request.get('/api/admin/dashboard')).status()).toBe(401)
  expect((await request.get('/_snapshot-source?path=%2F')).status()).toBe(404)
  expect(
    (
      await request.post('/api/admin/login', {
        data: { email: 'admin@example.com', password: 'wrong-password' },
      })
    ).status(),
  ).toBe(403)
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  try {
    const staticPage = await context.newPage()
    const staticAdmin = new AdminPage(staticPage)
    await staticPage.goto(`${baseURL}/admin/login`)
    await expect(staticAdmin.siteHeader).toBeVisible()
    await expect(staticAdmin.siteFooter).toBeVisible()
    const warning = staticAdmin.noJavaScriptWarning
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('Admin studio requires JavaScript.')
  } finally {
    await context.close()
  }
})

test('authenticated CMS rejects mutations without CSRF and exposes the inbox', async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.ADMIN_PASSWORD,
    'ADMIN_PASSWORD is required for authenticated CMS checks',
  )
  const admin = new AdminPage(page)
  await admin.openLogin()
  await admin.signIn(
    process.env.ADMIN_EMAIL ?? 'admin@example.com',
    process.env.ADMIN_PASSWORD!,
  )
  await expect(page).toHaveURL(/\/admin$/)
  await expect(admin.dashboardStats).toBeVisible()
  await expect(admin.siteHeader).toBeVisible()
  await expect(admin.siteFooter).toBeVisible()
  await expect(admin.main).toHaveCount(1)
  await expect(admin.canonical).toHaveCount(0)
  expect(
    (
      await page.request.post('/api/admin/posts/post-1/publish', {
        data: { status: 'draft' },
      })
    ).status(),
  ).toBe(403)
  let documentNavigations = 0
  page.on('request', (navigation) => {
    if (
      navigation.isNavigationRequest() &&
      navigation.resourceType() === 'document'
    )
      documentNavigations++
  })
  await admin.openInquiries()
  await expect(admin.guestInquiriesHeading).toBeVisible()
  await expect(admin.emptyInquiries.or(admin.tableRows.first())).toBeVisible()
  await admin.openHotels()
  await expect(admin.sectionHeading).toHaveText('Hotels')
  await admin.editFirstHotel()
  await expect(admin.editorForm).toBeVisible()
  const editorUrl = page.url()
  await page.goBack()
  await expect(admin.sectionHeading).toHaveText('Hotels')
  await expect(admin.tableRows.first()).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(editorUrl)
  await expect(admin.editorForm).toBeVisible()
  expect(documentNavigations).toBe(0)
  await admin.openNewHotel()
  await expect(admin.editorForm).toBeVisible()
  await expect(admin.siteFooter).toBeVisible()
  await admin.openMedia()
  await expect(admin.sectionHeading).toHaveText('Media library')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(admin.mobileMenu).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await admin.signOut()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await admin.openNewHotel()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(admin.siteHeader).toBeVisible()
  await expect(admin.siteFooter).toBeVisible()
  expect((await request.get('/api/admin/dashboard')).status()).toBe(401)
})

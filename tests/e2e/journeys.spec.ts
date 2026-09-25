import { expect, test } from '@playwright/test'

test('published pages contain crawlable Razor content and rehydrate independent galleries', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const response = await page.goto('/hotels/casa-aurelia')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
  await expect(page.locator('main h1')).toHaveText('Casa Aurelia')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/hotels\/casa-aurelia$/,
  )
  await page
    .getByRole('button', {
      name: 'Open Casa Aurelia gallery image 1 — property',
    })
    .click()
  await expect(page.locator('dialog.gallery-lightbox')).toBeVisible()
  await page.getByRole('button', { name: 'Next photo' }).click()
  await expect(page.locator('.gallery-lightbox__heading')).toContainText(
    '2 of 3',
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog.gallery-lightbox')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('hotel detail presents gallery, room choices and useful sections without dead space', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1568, height: 900 })
  const response = await page.goto('/hotels/jayanagar-common-house')
  expect(response?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
  const gallery = page.locator('[data-island="Gallery"] .gallery-grid')
  await expect(gallery).toBeVisible()
  const frame = await gallery
    .locator('.gallery-grid__item')
    .first()
    .boundingBox()
  const photo = await gallery
    .locator('.gallery-grid__image')
    .first()
    .boundingBox()
  expect(photo!.width).toBe(frame!.width)
  expect(photo!.height).toBe(frame!.height)
  await expect(gallery.locator('.gallery-grid__image').first()).toHaveCSS(
    'object-fit',
    'cover',
  )

  const highlights = page.locator('.hotel-highlights__card')
  const firstHighlight = await highlights.first().boundingBox()
  const secondHighlight = await highlights.nth(1).boundingBox()
  expect(secondHighlight!.x).toBeGreaterThan(firstHighlight!.x)
  const overview = await page.locator('.hotel-page__overview').boundingBox()
  expect(overview!.height).toBeLessThan(600)
  const firstRoom = page.locator('.hotel-room').first()
  const roomImage = await firstRoom.locator('.hotel-room__image').boundingBox()
  const roomCopy = await firstRoom.locator('.hotel-room__content').boundingBox()
  expect(roomCopy!.x).toBeGreaterThanOrEqual(roomImage!.x + roomImage!.width)
  await expect(firstRoom.locator('.hotel-room__amenities')).toBeVisible()
  await expect(page.locator('.hotel-facilities__facts')).toBeVisible()
  await expect(page.locator('.hotel-location__places')).toBeVisible()

  const faq = page.locator('.hotel-policies__faq details').first()
  await faq.locator('summary').click()
  await expect(faq).toHaveAttribute('open', '')
  await expect(faq.locator('.hotel-policies__answer')).toBeVisible()
  await expect(page.locator('.hotel-reviews__summary')).toContainText(
    '3 reviews',
  )
  await expect(page.locator('.hotel-reviews__card').first()).toBeVisible()
  await firstRoom.getByRole('link', { name: 'Inquire' }).click()
  await expect(page).toHaveURL(/\/inquire\?hotel=[^&]+&room=[^&]+$/)
  await expect(page.locator('.inquiry-page__intro h1')).toContainText(
    'Tell us about your journey.',
  )
  await expect(page.locator('.inquiry-page__hotel')).toContainText(
    'Bed in 6-bed women’s ensuite dorm',
  )

  await page.goto('/hotels/jayanagar-common-house')
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileRoomImage = await firstRoom
    .locator('.hotel-room__image')
    .boundingBox()
  const mobileRoomCopy = await firstRoom
    .locator('.hotel-room__content')
    .boundingBox()
  expect(mobileRoomCopy!.y).toBeGreaterThanOrEqual(
    mobileRoomImage!.y + mobileRoomImage!.height,
  )
  const mobileFirstHighlight = await highlights.first().boundingBox()
  const mobileSecondHighlight = await highlights.nth(1).boundingBox()
  expect(mobileSecondHighlight!.y).toBeGreaterThan(
    mobileFirstHighlight!.y + mobileFirstHighlight!.height,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
})

test('offer pairs its image with the request and keeps terms beside the offer card', async ({
  page,
  browser,
  baseURL,
}) => {
  const path = '/hotels/casa-aurelia/offers/signature-offer'
  await page.setViewportSize({ width: 1568, height: 900 })
  const response = await page.goto(path)
  expect(response?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
  const hero = page.locator('.offer-page__hero')
  const image = hero.locator('.offer-page__image')
  const copy = hero.locator('.offer-page__hero-copy')
  await expect(copy.getByRole('heading', { level: 1 })).toHaveText(
    'Slow season escape',
  )
  await expect(copy).toContainText('15% value')
  await expect(copy).toContainText('Valid for stays from')
  const imageBox = await image.boundingBox()
  const copyBox = await copy.boundingBox()
  expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(copyBox!.x + 1)
  expect(imageBox!.y).toBe(copyBox!.y)
  expect(imageBox!.height).toBe(copyBox!.height)
  const benefits = page.locator('.offer-page__benefits')
  const aside = page.locator('.offer-page__aside')
  const benefitsBox = await benefits.boundingBox()
  const asideBox = await aside.boundingBox()
  expect(benefitsBox!.x + benefitsBox!.width).toBeLessThan(asideBox!.x)
  await expect(page.locator('.offer-page__terms')).toContainText(
    'Subject to availability. Blackout dates may apply.',
  )

  await copy.getByRole('link', { name: 'Request this offer' }).click()
  await expect(page).toHaveURL(/\/inquire\?hotel=[^&]+&offer=[^&]+$/)
  await expect(page.locator('.inquiry-page__hotel')).toContainText(
    'Offer: Slow season escape',
  )

  await page.goto(path)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileImage = await image.boundingBox()
  const mobileCopy = await copy.boundingBox()
  expect(mobileCopy!.y).toBeGreaterThanOrEqual(
    mobileImage!.y + mobileImage!.height,
  )
  const mobileBenefits = await benefits.boundingBox()
  const mobileAside = await aside.boundingBox()
  expect(mobileAside!.y).toBeGreaterThan(
    mobileBenefits!.y + mobileBenefits!.height,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await aside.getByRole('link', { name: 'Check availability' }).click()
  await expect(page.locator('.inquiry-page__hotel')).toContainText(
    'Offer: Slow season escape',
  )

  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  try {
    const staticPage = await context.newPage()
    await staticPage.goto(`${baseURL}${path}`)
    await expect(staticPage.locator('.offer-page__benefits')).toBeVisible()
    await staticPage.getByRole('link', { name: 'Request this offer' }).click()
    await expect(staticPage.locator('.inquiry-page__hotel')).toContainText(
      'Offer: Slow season escape',
    )
    await expect(
      staticPage.locator('[data-fallback-for="InquiryForm"]'),
    ).toBeVisible()
  } finally {
    await context.close()
  }
})

test('hotel photos and FAQs remain usable without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/hotels/jayanagar-common-house`)
    const gallery = page.locator('[data-fallback-for="Gallery"]')
    await expect(gallery).toBeVisible()
    await expect(page.locator('[data-island="Gallery"]')).toBeHidden()
    const photo = gallery.locator('a.gallery-grid__item').first()
    await expect(photo.locator('img')).toBeVisible()
    await photo.click()
    await expect(page).toHaveURL(/\/images\//)
    await page.goBack()
    const faq = page.locator('.hotel-policies__faq details').first()
    await faq.locator('summary').click()
    await expect(faq.locator('.hotel-policies__answer')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('room inquiry keeps its stay context beside the form and stacks on mobile', async ({
  page,
  browser,
  baseURL,
}) => {
  const path =
    '/inquire?hotel=hotel-bengaluru-jayanagar&room=hotel-bengaluru-female-dorm'
  await page.setViewportSize({ width: 1568, height: 900 })
  await page.goto(path)
  const intro = page.locator('.inquiry-page__intro')
  const selectedStay = page.locator('.inquiry-page__hotel')
  const form = page.locator('.inquiry-page__form .inquiry-page__card')
  await expect(selectedStay).toContainText('Jayanagar Common House')
  await expect(selectedStay).toContainText('Bed in 6-bed women’s ensuite dorm')
  await expect(form).toBeVisible()
  const left = await intro.boundingBox()
  const right = await form.boundingBox()
  expect(left!.x + left!.width).toBeLessThan(right!.x)
  expect(right!.x + right!.width).toBeLessThanOrEqual(1568)
  await page.getByRole('button', { name: 'Check in' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Choose date calendar' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByLabel('Full name').fill('Test Guest')
  await page.getByLabel('Email').fill('guest@example.test')
  await page.getByRole('button', { name: 'Send inquiry' }).click()
  await expect(
    page.getByText('Choose a check-in date today or later.'),
  ).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileIntro = await intro.boundingBox()
  const mobileForm = await form.boundingBox()
  const footer = await page.locator('.site-footer').boundingBox()
  expect(mobileForm!.y).toBeGreaterThanOrEqual(
    mobileIntro!.y + mobileIntro!.height,
  )
  expect(footer!.y).toBeGreaterThanOrEqual(mobileForm!.y + mobileForm!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )

  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const noScript = await context.newPage()
    await noScript.goto(`${baseURL}${path}`)
    await expect(noScript.locator('.inquiry-page__hotel')).toContainText(
      'Bed in 6-bed women’s ensuite dorm',
    )
    await expect(
      noScript.locator('[data-fallback-for="InquiryForm"]'),
    ).toContainText('No inquiry has been submitted')
  } finally {
    await context.close()
  }
})

test('home cards fill their frames and the overlay header gains contrast after scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1568, height: 900 })
  await page.goto('/')
  const header = page.locator('.site-header')
  await expect(page.locator('.site-header__mobile-toggle')).toBeHidden()
  await expect(header).toHaveClass(/site-header--overlay/)
  const card = page
    .locator('.home-page__destination-grid .destination-card')
    .first()
  const image = card.locator('img')
  await expect(image).toHaveCSS('object-fit', 'cover')
  const frame = await card
    .locator('.destination-card__image-wrap')
    .boundingBox()
  const imageBounds = await image.boundingBox()
  expect(imageBounds!.width).toBeGreaterThan(frame!.width * 0.95)
  expect(imageBounds!.height).toBeGreaterThan(frame!.height * 0.95)
  await card.scrollIntoViewIfNeeded()
  await expect(header).toHaveClass(/site-header--solid/)
  await expect(page.locator('.site-header__search-button')).toHaveClass(
    /is-primary/,
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(header).toHaveClass(/site-header--overlay/)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileToggle = page.locator('.site-header__mobile-toggle')
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
  await page.goto('/destinations')
  await expect(page.locator('main .eyebrow').first()).toHaveText('FIELD GUIDES')
  await expect(page.locator('main h1')).toContainText('Places worth')
  await expect(page.locator('main h1')).toContainText('knowing slowly.')
  const cards = page.locator('.destination-page__grid .destination-card')
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

test('mobile snapshot remains navigable without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/destinations/amalfi-coast`)
    await expect(page.locator('main h1')).toHaveCount(1)
    await expect(page.locator('[data-fallback-for="MobileNav"]')).toBeVisible()
    await expect(page.locator('[data-island="MobileNav"]')).toBeHidden()
    await page.locator('[data-fallback-for="MobileNav"] summary').click()
    await page
      .locator('[data-fallback-for="MobileNav"] a[href="/blog"]')
      .click()
    await expect(page).toHaveURL(/\/blog$/)
    await expect(page.locator('main h1')).toHaveCount(1)
  } finally {
    await context.close()
  }
})

test('search results occupy two columns beside filters and sort without overlapping footer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1568, height: 900 })
  await page.goto('/search')
  const cards = page.locator('.search-page__results .hotel-card')
  await expect(cards).toHaveCount(9)
  const filterPanel = page.locator(
    '[data-island="SearchExperience"] .search-page__filters',
  )
  await expect(filterPanel).toBeVisible()
  const filters = await filterPanel.boundingBox()
  const first = await cards.first().boundingBox()
  const second = await cards.nth(1).boundingBox()
  const last = await cards.last().boundingBox()
  const footer = await page.locator('.site-footer').boundingBox()
  expect(filters!.x + filters!.width).toBeLessThan(first!.x)
  expect(second!.x).toBeGreaterThan(first!.x)
  expect(second!.y).toBe(first!.y)
  expect(footer!.y).toBeGreaterThan(last!.y + last!.height)
  await page
    .getByRole('combobox', { name: 'Sort by' })
    .selectOption('price-asc')
  await expect(page).toHaveURL(/sort=price-asc/)
  const firstHotel = await cards
    .first()
    .locator('.hotel-card__title')
    .innerText()
  await page
    .getByRole('navigation', { name: 'Search result pages' })
    .getByRole('link', { name: '2' })
    .click()
  await expect(page).toHaveURL(/page=2/)
  expect(
    await cards.first().locator('.hotel-card__title').innerText(),
  ).not.toBe(firstHotel)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileFirst = await cards.first().boundingBox()
  const mobileSecond = await cards.nth(1).boundingBox()
  expect(mobileSecond!.y).toBeGreaterThan(mobileFirst!.y + mobileFirst!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
})

test('search and sorting remain usable without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/search`)
    await expect(
      page.getByRole('form', { name: 'Search hotels' }),
    ).toBeVisible()
    await page
      .getByRole('form', { name: 'Search hotels' })
      .getByRole('combobox', { name: 'Destination' })
      .selectOption('amalfi-coast')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page).toHaveURL(/destination=amalfi-coast/)
    await expect(
      page.locator('.search-page__results .hotel-card').first(),
    ).toBeVisible()
    await page
      .getByRole('combobox', { name: 'Sort by' })
      .selectOption('price-asc')
    await page.getByRole('button', { name: 'Sort', exact: true }).click()
    await expect(page).toHaveURL(/sort=price-asc/)
  } finally {
    await context.close()
  }
})

test('journal cards and stories keep editorial layouts on desktop and mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1568, height: 900 })
  const listing = await page.goto('/blog')
  expect(listing?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
  await expect(page.locator('.blog-page__header h1')).toContainText(
    'Stories for going well.',
  )
  const cards = page.locator('.blog-page__grid .blog-page__card')
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

  await featured.locator('a').click()
  await expect(page).toHaveURL(/\/blog\/the-art-of-the-unhurried-arrival$/)
  await expect(page.locator('.blog-page__post-header h1')).toHaveText(
    'The art of the unhurried arrival',
  )
  const hero = await page.locator('.blog-page__hero').boundingBox()
  expect(hero!.width).toBe(1568)
  await expect(page.locator('.rich-content__hotel a').first()).toBeVisible()
  await expect(page.locator('.blog-page__post-footer a')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileHero = await page.locator('.blog-page__hero').boundingBox()
  expect(mobileHero!.width).toBe(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await page.locator('.blog-page__post-footer a').click()
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
  const response = await page.goto(
    '/search?destination=amalfi-coast&rating=4.5',
  )
  expect(response?.status()).toBe(200)
  expect(response?.headers()['x-snapshot-version']).toBeUndefined()
  expect(response?.headers()['cache-control']).toBe('private, no-store')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,follow',
  )
  await expect(page.getByRole('form', { name: 'Filter hotels' })).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Minimum rating' })
    .selectOption('4.7')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/rating=4\.7/)
  await expect(page.locator('main h1')).toHaveCount(1)
})

test('admin and internal snapshot source refuse anonymous access', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,nofollow',
  )
  await expect(page.locator('header.site-header')).toBeVisible()
  await expect(page.locator('footer.site-footer')).toBeVisible()
  await expect(page.locator('#main h1')).toHaveText('Welcome back.')
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileMenu = page.locator('[data-fallback-for="MobileNav"]')
  await expect(mobileMenu).toBeVisible()
  await mobileMenu.locator('summary').click()
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
    await staticPage.goto(`${baseURL}/admin/login`)
    await expect(staticPage.locator('header.site-header')).toBeVisible()
    await expect(staticPage.locator('footer.site-footer')).toBeVisible()
    const warning = staticPage.locator('#admin-root noscript .notification')
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
  await page.goto('/admin/login')
  await page
    .getByRole('textbox', { name: 'Email' })
    .fill(process.env.ADMIN_EMAIL ?? 'admin@example.com')
  await page.getByLabel('Password').fill(process.env.ADMIN_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.locator('.admin-dashboard__stats')).toBeVisible()
  await expect(page.locator('header.site-header')).toBeVisible()
  await expect(page.locator('footer.site-footer')).toBeVisible()
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
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
  await page.getByRole('link', { name: 'Inquiries' }).click()
  await expect(
    page.getByRole('heading', { name: 'Guest inquiries' }),
  ).toBeVisible()
  await expect(
    page
      .getByText('No inquiries yet.')
      .or(page.locator('table tbody tr').first()),
  ).toBeVisible()
  await page.locator('.admin-shell__nav a[href="/admin/hotels"]').click()
  await expect(page.locator('.admin-shell__header h1')).toHaveText('Hotels')
  await page
    .locator('table tbody tr')
    .first()
    .getByRole('button', { name: 'Edit' })
    .click()
  await expect(page.locator('.admin-content-form')).toBeVisible()
  const editorUrl = page.url()
  await page.goBack()
  await expect(page.locator('.admin-shell__header h1')).toHaveText('Hotels')
  await expect(page.locator('table tbody tr').first()).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(editorUrl)
  await expect(page.locator('.admin-content-form')).toBeVisible()
  expect(documentNavigations).toBe(0)
  await page.goto('/admin/hotels/new')
  await expect(page.locator('.admin-content-form')).toBeVisible()
  await expect(page.locator('footer.site-footer')).toBeVisible()
  await page.goto('/admin/media')
  await expect(page.locator('.admin-shell__header h1')).toHaveText(
    'Media library',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('[data-fallback-for="MobileNav"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await page.goto('/admin/hotels/new')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.locator('header.site-header')).toBeVisible()
  await expect(page.locator('footer.site-footer')).toBeVisible()
  expect((await request.get('/api/admin/dashboard')).status()).toBe(401)
})

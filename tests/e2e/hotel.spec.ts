import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { AdminPage } from './pages/admin'
import { HotelPage } from './pages/hotel'
import { InquiryPage } from './pages/inquiry'
import { OfferPage } from './pages/offer'

// This file includes authenticated inquiry proof; never retain credential artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

function futureStayDates() {
  const today = new Date()
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const date = (day: number) =>
    iso(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day))
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  )
  return {
    previousMonthNeeded: today.getDate() === 1,
    yesterday: iso(yesterday),
    beforeCheckIn: date(9),
    checkIn: date(10),
    checkOut: date(12),
    laterCheckOut: date(13),
    monthLabel: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(nextMonth),
  }
}

function calendarDay(inquiry: InquiryPage, date: string) {
  return inquiry.calendar.locator(`[data-day="${date}"]:not([data-month])`)
}

async function openNextMonth(
  inquiry: InquiryPage,
  field: 'Check in' | 'Check out',
  monthLabel: string,
) {
  await inquiry.page.getByRole('button', { name: field, exact: true }).click()
  await expect(inquiry.calendar).toBeVisible()
  await inquiry.calendar
    .getByRole('button', { name: 'Go to the Next Month', exact: false })
    .click()
  await expect(inquiry.calendar.getByRole('status')).toHaveText(monthLabel)
}

async function selectFutureStay(inquiry: InquiryPage) {
  const dates = await inquiry.page.evaluate(futureStayDates)
  await openNextMonth(inquiry, 'Check in', dates.monthLabel)
  await calendarDay(inquiry, dates.checkIn).getByRole('button').click()
  await expect(inquiry.page.locator('input[name="checkIn"]')).toHaveValue(
    dates.checkIn,
  )
  await openNextMonth(inquiry, 'Check out', dates.monthLabel)
  await calendarDay(inquiry, dates.checkOut).getByRole('button').click()
  await expect(inquiry.page.locator('input[name="checkOut"]')).toHaveValue(
    dates.checkOut,
  )
  return dates
}

test('hotel detail presents gallery, room choices and useful sections without dead space', async ({
  page,
}) => {
  const hotel = new HotelPage(page)
  const inquiry = new InquiryPage(page)
  await page.setViewportSize({ width: 1568, height: 900 })
  const response = await hotel.goto()
  expect(response?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
  await expect(hotel.gallery).toBeVisible()
  const frame = await hotel.firstGalleryFrame.boundingBox()
  const photo = await hotel.firstGalleryImage.boundingBox()
  expect(photo!.width).toBe(frame!.width)
  expect(photo!.height).toBe(frame!.height)
  await expect(hotel.firstGalleryImage).toHaveCSS('object-fit', 'cover')

  const firstHighlight = await hotel.highlights.first().boundingBox()
  const secondHighlight = await hotel.highlights.nth(1).boundingBox()
  expect(secondHighlight!.x).toBeGreaterThan(firstHighlight!.x)
  const overview = await hotel.overview.boundingBox()
  expect(overview!.height).toBeLessThan(600)
  const roomImage = await hotel.firstRoomImage.boundingBox()
  const roomCopy = await hotel.firstRoomCopy.boundingBox()
  expect(roomCopy!.x).toBeGreaterThanOrEqual(roomImage!.x + roomImage!.width)
  await expect(hotel.firstRoomAmenities).toBeVisible()
  await expect(hotel.facilityFacts).toBeVisible()
  await expect(hotel.nearbyPlaces).toBeVisible()

  await hotel.openFirstFaq()
  await expect(hotel.firstFaq).toHaveAttribute('open', '')
  await expect(hotel.firstFaqAnswer).toBeVisible()
  await expect(hotel.reviewsSummary).toContainText('3 reviews')
  await expect(hotel.firstReview).toBeVisible()
  await hotel.inquireAboutFirstRoom()
  await expect(page).toHaveURL(/\/inquire\?hotel=[^&]+&room=[^&]+$/)
  await expect(inquiry.heading).toContainText('Tell us about your journey.')
  await expect(inquiry.selectedStay).toContainText(
    'Bed in 6-bed women’s ensuite dorm',
  )

  await hotel.goto()
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileRoomImage = await hotel.firstRoomImage.boundingBox()
  const mobileRoomCopy = await hotel.firstRoomCopy.boundingBox()
  expect(mobileRoomCopy!.y).toBeGreaterThanOrEqual(
    mobileRoomImage!.y + mobileRoomImage!.height,
  )
  const mobileFirstHighlight = await hotel.highlights.first().boundingBox()
  const mobileSecondHighlight = await hotel.highlights.nth(1).boundingBox()
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
  const offer = new OfferPage(page)
  const inquiry = new InquiryPage(page)
  await page.setViewportSize({ width: 1568, height: 900 })
  const response = await offer.goto()
  expect(response?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
  await expect(offer.heading).toHaveText('Slow season escape')
  await expect(offer.copy).toContainText('15% value')
  await expect(offer.copy).toContainText('Valid for stays from')
  const imageBox = await offer.image.boundingBox()
  const copyBox = await offer.copy.boundingBox()
  expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(copyBox!.x + 1)
  expect(imageBox!.y).toBe(copyBox!.y)
  expect(imageBox!.height).toBe(copyBox!.height)
  const benefitsBox = await offer.benefits.boundingBox()
  const asideBox = await offer.aside.boundingBox()
  expect(benefitsBox!.x + benefitsBox!.width).toBeLessThan(asideBox!.x)
  await expect(offer.terms).toContainText(
    'Subject to availability. Blackout dates may apply.',
  )

  await offer.requestOffer()
  await expect(page).toHaveURL(/\/inquire\?hotel=[^&]+&offer=[^&]+$/)
  await expect(inquiry.selectedStay).toContainText('Offer: Slow season escape')

  await offer.goto()
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileImage = await offer.image.boundingBox()
  const mobileCopy = await offer.copy.boundingBox()
  expect(mobileCopy!.y).toBeGreaterThanOrEqual(
    mobileImage!.y + mobileImage!.height,
  )
  const mobileBenefits = await offer.benefits.boundingBox()
  const mobileAside = await offer.aside.boundingBox()
  expect(mobileAside!.y).toBeGreaterThan(
    mobileBenefits!.y + mobileBenefits!.height,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await offer.checkAvailability()
  await expect(inquiry.selectedStay).toContainText('Offer: Slow season escape')

  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  try {
    const staticPage = await context.newPage()
    const staticOffer = new OfferPage(staticPage)
    const staticInquiry = new InquiryPage(staticPage)
    await staticOffer.goto(`${baseURL}${staticOffer.path}`)
    await expect(staticOffer.benefits).toBeVisible()
    await staticOffer.requestOffer()
    await expect(staticInquiry.selectedStay).toContainText(
      'Offer: Slow season escape',
    )
  } finally {
    await context.close()
  }
})

test('hotel FAQs remain usable without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  try {
    const page = await context.newPage()
    const hotel = new HotelPage(page)
    await hotel.goto(`${baseURL}${hotel.path}`)
    await hotel.openFirstFaq()
    await expect(hotel.firstFaqAnswer).toBeVisible()
  } finally {
    await context.close()
  }
})

test('room inquiry keeps its stay context beside the form and stacks on mobile', async ({
  page,
}) => {
  const inquiry = new InquiryPage(page)
  await page.setViewportSize({ width: 1568, height: 900 })
  await inquiry.gotoRoomInquiry()
  await expect(inquiry.selectedStay).toContainText('Jayanagar Common House')
  await expect(inquiry.selectedStay).toContainText(
    'Bed in 6-bed women’s ensuite dorm',
  )
  await expect(inquiry.form).toBeVisible()
  const left = await inquiry.intro.boundingBox()
  const right = await inquiry.form.boundingBox()
  expect(left!.x + left!.width).toBeLessThan(right!.x)
  expect(right!.x + right!.width).toBeLessThanOrEqual(1568)
  await inquiry.openCheckInCalendar()
  await expect(inquiry.calendar).toBeVisible()
  await inquiry.dismissCalendar()
  await inquiry.fillContactDetails('Test Guest', 'guest@example.test')
  await inquiry.submit()
  await expect(inquiry.missingCheckInMessage).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileIntro = await inquiry.intro.boundingBox()
  const mobileForm = await inquiry.form.boundingBox()
  const footer = await inquiry.footer.boundingBox()
  expect(mobileForm!.y).toBeGreaterThanOrEqual(
    mobileIntro!.y + mobileIntro!.height,
  )
  expect(footer!.y).toBeGreaterThanOrEqual(mobileForm!.y + mobileForm!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
})

test('room inquiry calendar preserves dates, disabled bounds and dismissal focus', async ({
  page,
}) => {
  const inquiry = new InquiryPage(page)
  await inquiry.gotoRoomInquiry()
  const dates = await page.evaluate(futureStayDates)
  const checkInTrigger = page.getByRole('button', {
    name: 'Check in',
    exact: true,
  })
  const checkOutTrigger = page.getByRole('button', {
    name: 'Check out',
    exact: true,
  })
  const checkIn = page.locator('input[name="checkIn"]')
  const checkOut = page.locator('input[name="checkOut"]')
  let submissions = 0
  await page.route('**/api/inquiries', async (route) => {
    submissions++
    await route.abort()
  })

  await inquiry.openCheckInCalendar()
  await expect(inquiry.calendar).toBeVisible()
  await expect(checkInTrigger).toHaveAttribute('aria-expanded', 'true')
  if (dates.previousMonthNeeded) {
    await inquiry.calendar
      .getByRole('button', { name: 'Go to the Previous Month', exact: false })
      .click()
  }
  await expect(calendarDay(inquiry, dates.yesterday)).toHaveAttribute(
    'data-disabled',
    'true',
  )
  await expect(
    calendarDay(inquiry, dates.yesterday).getByRole('button'),
  ).toBeDisabled()
  if (dates.previousMonthNeeded) {
    await inquiry.calendar
      .getByRole('button', { name: 'Go to the Next Month', exact: false })
      .click()
  }
  await inquiry.calendar
    .getByRole('button', { name: 'Go to the Next Month', exact: false })
    .click()
  await expect(inquiry.calendar.getByRole('status')).toHaveText(
    dates.monthLabel,
  )
  await calendarDay(inquiry, dates.beforeCheckIn).getByRole('button').focus()
  await page.keyboard.press('ArrowRight')
  await expect(
    calendarDay(inquiry, dates.checkIn).getByRole('button'),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(inquiry.calendar).toBeHidden()
  await expect(checkIn).toHaveValue(dates.checkIn)
  await expect(checkInTrigger).toBeFocused()

  await openNextMonth(inquiry, 'Check in', dates.monthLabel)
  await expect(calendarDay(inquiry, dates.checkIn)).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(checkIn).toHaveValue(dates.checkIn)
  await inquiry.dismissCalendar()
  await expect(inquiry.calendar).toBeHidden()
  await expect(checkInTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(checkInTrigger).toBeFocused()

  await openNextMonth(inquiry, 'Check out', dates.monthLabel)
  for (const date of [dates.beforeCheckIn, dates.checkIn]) {
    await expect(calendarDay(inquiry, date)).toHaveAttribute(
      'data-disabled',
      'true',
    )
    await expect(calendarDay(inquiry, date).getByRole('button')).toBeDisabled()
  }
  await expect(
    calendarDay(inquiry, dates.checkOut).getByRole('button'),
  ).toBeEnabled()
  await calendarDay(inquiry, dates.checkOut).getByRole('button').click()
  await expect(checkOut).toHaveValue(dates.checkOut)
  await expect(inquiry.calendar).toBeHidden()
  await expect(checkOutTrigger).toBeFocused()

  await openNextMonth(inquiry, 'Check out', dates.monthLabel)
  await expect(calendarDay(inquiry, dates.checkOut)).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await inquiry.heading.click()
  await expect(inquiry.calendar).toBeHidden()
  await expect(checkOutTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(checkOutTrigger).toBeFocused()
  await expect(checkOut).toHaveValue(dates.checkOut)

  await openNextMonth(inquiry, 'Check in', dates.monthLabel)
  await calendarDay(inquiry, dates.checkOut).getByRole('button').click()
  await expect(checkIn).toHaveValue(dates.checkOut)
  await expect(checkOut).toHaveValue('')
  await expect(checkInTrigger).toBeFocused()
  await openNextMonth(inquiry, 'Check out', dates.monthLabel)
  await expect(
    calendarDay(inquiry, dates.checkOut).getByRole('button'),
  ).toBeDisabled()
  await expect(
    calendarDay(inquiry, dates.laterCheckOut).getByRole('button'),
  ).toBeEnabled()
  await inquiry.dismissCalendar()
  await expect(checkOutTrigger).toBeFocused()
  await inquiry.fillContactDetails('Calendar Guest', 'calendar@example.test')
  await inquiry.submit()
  await expect(
    page.getByText('Check-out must be after check-in.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send inquiry' })).toBeEnabled()
  expect(submissions).toBe(0)
})

test('inquiry API field errors are accessible and allow another submission', async ({
  page,
}) => {
  const inquiry = new InquiryPage(page)
  await inquiry.gotoRoomInquiry()
  await selectFutureStay(inquiry)
  await inquiry.fillContactDetails('Field Error Guest', 'field@example.test')
  let attempts = 0
  let releaseResponse!: () => void
  let responseReceived!: () => void
  const received = new Promise<void>((resolve) => {
    responseReceived = resolve
  })
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve
  })
  await page.route('**/api/inquiries', async (route) => {
    attempts++
    responseReceived()
    await responseGate
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        fieldErrors: {
          email: ['Enter a valid email address'],
          checkOut: ['Check-out must be after check-in'],
          roomId: ['Room is not available at this hotel'],
        },
      }),
    })
  })

  await inquiry.submit()
  await received
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  releaseResponse()
  const email = page.getByLabel('Email', { exact: true })
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveAccessibleDescription('Enter a valid email address')
  await expect(page.getByText('Enter a valid email address')).toBeVisible()
  await expect(
    page.getByText('Check-out must be after check-in', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toHaveText(
    'Room is not available at this hotel',
  )
  await expect(page.getByRole('button', { name: 'Send inquiry' })).toBeEnabled()
  await email.fill('corrected@example.test')
  const [retry, failedResponse] = await Promise.all([
    page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === '/api/inquiries' &&
        request.method() === 'POST',
    ),
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/inquiries' &&
        response.request().method() === 'POST',
    ),
    inquiry.submit(),
  ])
  expect(retry.postDataJSON().email).toBe('corrected@example.test')
  expect(failedResponse.status()).toBe(400)
  await expect(page.getByRole('button', { name: 'Send inquiry' })).toBeEnabled()
  await expect(page.getByText('Enter a valid email address')).toBeVisible()
  await expect(page.locator('.inquiry-page__success')).toHaveCount(0)
  expect(attempts).toBe(2)
})

test.describe('disposable integration catalog inquiry', () => {
  test.describe.configure({ retries: 0 })

  test('successful room inquiry appears with its reference in the authenticated inbox', async ({
    page,
  }) => {
    if (process.env.E2E_DISPOSABLE_CATALOG !== '1') {
      throw new Error(
        'E2E_DISPOSABLE_CATALOG=1 is required for a real inquiry in a disposable integration catalog',
      )
    }
    const email = process.env.ADMIN_EMAIL
    const password = process.env.ADMIN_PASSWORD
    if (!email || !password) {
      throw new Error(
        'ADMIN_EMAIL and ADMIN_PASSWORD are required for authenticated inbox verification',
      )
    }
    const admin = new AdminPage(page)
    await admin.openLogin()
    await admin.signIn(email, password)
    await expect(page).toHaveURL(/\/admin$/)
    await expect(admin.dashboardStats).toBeVisible()

    const inquiry = new InquiryPage(page)
    await inquiry.gotoRoomInquiry()
    const dates = await selectFutureStay(inquiry)
    const unique = randomUUID()
    const guest = {
      name: `Integration Guest ${unique}`,
      email: `inquiry-${unique}@example.test`,
      phone: '+1 202 555 0147',
      message: `Disposable room inquiry ${unique}`,
    }
    await inquiry.fillContactDetails(guest.name, guest.email)
    await page.getByLabel('Phone, optional').fill(guest.phone)
    await page.getByLabel('Anything we should know?').fill(guest.message)
    await page.getByLabel('Adults', { exact: true }).selectOption('3')
    await page.getByLabel('Children', { exact: true }).selectOption('1')
    let submissions = 0
    page.on('request', (request) => {
      if (
        new URL(request.url()).pathname === '/api/inquiries' &&
        request.method() === 'POST'
      )
        submissions++
    })
    const [submitted, response] = await Promise.all([
      page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === '/api/inquiries' &&
          request.method() === 'POST',
      ),
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/inquiries' &&
          response.request().method() === 'POST',
      ),
      inquiry.submit(),
    ])
    expect(submitted.postDataJSON()).toEqual({
      hotelId: 'hotel-bengaluru-jayanagar',
      roomId: 'hotel-bengaluru-female-dorm',
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      adults: 3,
      children: 1,
      ...guest,
      website: '',
    })
    expect(response.status()).toBe(200)
    const result = (await response.json()) as {
      id: string
      reference: string
    }
    expect(result.id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    )
    expect(result.reference).toBe(result.id.slice(0, 8).toUpperCase())
    const confirmation = page.getByRole('status')
    await expect(confirmation).toContainText('INQUIRY RECEIVED')
    await expect(confirmation.locator('strong')).toHaveText(result.reference)
    await expect(confirmation).toContainText(
      'This is an inquiry, not a confirmed reservation. No payment has been taken.',
    )
    expect(submissions).toBe(1)

    await admin.openAdmin()
    await expect(admin.dashboardStats).toBeVisible()
    await admin.openInquiries()
    await expect(admin.guestInquiriesHeading).toBeVisible()
    const row = admin.tableRows.filter({
      has: page.getByText(result.id, { exact: true }),
    })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(guest.name)
    await expect(row).toContainText('Jayanagar Common House')
    await expect(row).toContainText(`${dates.checkIn} – ${dates.checkOut}`)
    await expect(row.getByRole('link', { name: guest.email })).toHaveAttribute(
      'href',
      `mailto:${encodeURIComponent(guest.email)}`,
    )
    await expect(row).toContainText(guest.phone)
    await expect(row).toContainText(guest.message)
    await expect(row.getByRole('combobox')).toHaveValue('new')

    const dashboardResponse = await page.request.get('/api/admin/dashboard')
    expect(dashboardResponse.status()).toBe(200)
    const dashboard = (await dashboardResponse.json()) as {
      inquiries: {
        inquiry: {
          id: string
          hotelId: string
          roomId: string
          checkIn: string
          checkOut: string
          adults: number
          children: number
          name: string
          email: string
          phone: string
          message: string
          status: string
        }
        hotelName: string
      }[]
    }
    const saved = dashboard.inquiries.filter(
      ({ inquiry: record }) => record.id === result.id,
    )
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      hotelName: 'Jayanagar Common House',
      inquiry: {
        id: result.id,
        hotelId: 'hotel-bengaluru-jayanagar',
        roomId: 'hotel-bengaluru-female-dorm',
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        adults: 3,
        children: 1,
        ...guest,
        status: 'new',
      },
    })
    await admin.signOut()
    await expect(page).toHaveURL(/\/admin\/login$/)
  })
})

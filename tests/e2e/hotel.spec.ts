import { expect, test } from '@playwright/test'
import { HotelPage } from './pages/hotel'
import { InquiryPage } from './pages/inquiry'
import { OfferPage } from './pages/offer'

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

import type { Locator, Page } from '@playwright/test'

export class HotelPage {
  readonly path = '/hotels/jayanagar-common-house'
  readonly gallery: Locator
  readonly firstGalleryFrame: Locator
  readonly firstGalleryImage: Locator
  readonly highlights: Locator
  readonly overview: Locator
  readonly firstRoom: Locator
  readonly firstRoomImage: Locator
  readonly firstRoomCopy: Locator
  readonly firstRoomAmenities: Locator
  readonly facilityFacts: Locator
  readonly nearbyPlaces: Locator
  readonly firstFaq: Locator
  readonly firstFaqAnswer: Locator
  readonly reviewsSummary: Locator
  readonly firstReview: Locator

  constructor(readonly page: Page) {
    this.gallery = page.locator('[data-island="Gallery"] .gallery-grid')
    this.firstGalleryFrame = this.gallery.locator('.gallery-grid__item').first()
    this.firstGalleryImage = this.gallery
      .locator('.gallery-grid__image')
      .first()
    this.highlights = page.locator('.hotel-highlights__card')
    this.overview = page.locator('.hotel-page__overview')
    this.firstRoom = page.locator('.hotel-room').first()
    this.firstRoomImage = this.firstRoom.locator('.hotel-room__image')
    this.firstRoomCopy = this.firstRoom.locator('.hotel-room__content')
    this.firstRoomAmenities = this.firstRoom.locator('.hotel-room__amenities')
    this.facilityFacts = page.locator('.hotel-facilities__facts')
    this.nearbyPlaces = page.locator('.hotel-location__places')
    this.firstFaq = page.locator('.hotel-policies__faq details').first()
    this.firstFaqAnswer = this.firstFaq.locator('.hotel-policies__answer')
    this.reviewsSummary = page.locator('.hotel-reviews__summary')
    this.firstReview = page.locator('.hotel-reviews__card').first()
  }

  async goto(url = this.path) {
    return this.page.goto(url)
  }

  async openFirstFaq() {
    await this.firstFaq.locator('summary').click()
  }

  async inquireAboutFirstRoom() {
    await this.firstRoom.getByRole('link', { name: 'Inquire' }).click()
  }
}

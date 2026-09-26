import type { Locator, Page } from '@playwright/test'

export class OfferPage {
  readonly path = '/hotels/casa-aurelia/offers/signature-offer'
  readonly hero: Locator
  readonly image: Locator
  readonly copy: Locator
  readonly heading: Locator
  readonly benefits: Locator
  readonly aside: Locator
  readonly terms: Locator

  constructor(readonly page: Page) {
    this.hero = page.locator('.offer-page__hero')
    this.image = this.hero.locator('.offer-page__image')
    this.copy = this.hero.locator('.offer-page__hero-copy')
    this.heading = this.copy.getByRole('heading', { level: 1 })
    this.benefits = page.locator('.offer-page__benefits')
    this.aside = page.locator('.offer-page__aside')
    this.terms = page.locator('.offer-page__terms')
  }

  async goto(url = this.path) {
    return this.page.goto(url)
  }

  async requestOffer() {
    await this.copy.getByRole('link', { name: 'Request this offer' }).click()
  }

  async checkAvailability() {
    await this.aside.getByRole('link', { name: 'Check availability' }).click()
  }
}

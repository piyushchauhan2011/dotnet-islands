import type { Page } from '@playwright/test'

export class JournalPage {
  readonly listingHeading
  readonly cards
  readonly postHeading
  readonly hero
  readonly relatedHotel
  readonly backToStories

  constructor(private readonly page: Page) {
    this.listingHeading = page.locator('.blog-page__header h1')
    this.cards = page.locator('.blog-page__grid .blog-page__card')
    this.postHeading = page.locator('.blog-page__post-header h1')
    this.hero = page.locator('.blog-page__hero')
    this.relatedHotel = page.locator('.rich-content__hotel a').first()
    this.backToStories = page
      .locator('.blog-page__post-footer')
      .getByRole('link', { name: 'More stories' })
  }

  async openListing() {
    return this.page.goto('/blog')
  }

  async openFeaturedStory() {
    await this.cards.first().getByRole('link').click()
  }

  async returnToListing() {
    await this.backToStories.click()
  }
}

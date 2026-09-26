import type { Page } from '@playwright/test'

export class DestinationPage {
  constructor(readonly page: Page) {}

  get cards() {
    return this.page.locator('.destination-page__grid .destination-card')
  }

  async open() {
    return this.page.goto('/destinations')
  }
}

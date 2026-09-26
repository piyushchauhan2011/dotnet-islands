import type { Page } from '@playwright/test'

export class HomePage {
  constructor(readonly page: Page) {}

  get searchForm() {
    return this.page.locator('[data-island="SearchForm"] form')
  }

  get header() {
    return this.page.locator('.site-header')
  }

  get mobileToggle() {
    return this.page.locator('.site-header__mobile-toggle')
  }

  get mobileDialog() {
    return this.page.locator('dialog.mobile-navigation')
  }

  get firstDestinationCard() {
    return this.page
      .locator('.home-page__destination-grid .destination-card')
      .first()
  }

  async open() {
    return this.page.goto('/')
  }

  async openMenu() {
    await this.page.getByRole('button', { name: 'Open navigation' }).click()
  }

  async closeMenu() {
    await this.page.getByRole('button', { name: 'Close navigation' }).click()
  }
}

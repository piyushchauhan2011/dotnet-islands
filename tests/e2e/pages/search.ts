import type { Page } from '@playwright/test'

export class SearchPage {
  readonly cards
  readonly firstHotelTitle
  readonly filterPanel
  readonly footer
  readonly filterForm
  readonly robots
  readonly heading

  constructor(private readonly page: Page) {
    this.cards = page.locator('.search-page__results .hotel-card')
    this.firstHotelTitle = this.cards.first().locator('.hotel-card__title')
    this.filterPanel = page.locator(
      '[data-island="SearchExperience"] .search-page__filters',
    )
    this.footer = page.locator('.site-footer')
    this.filterForm = page.getByRole('form', { name: 'Filter hotels' })
    this.robots = page.locator('meta[name="robots"]')
    this.heading = page.locator('main h1')
  }

  async open(path = '/search') {
    return this.page.goto(path)
  }

  async sortBy(option: string) {
    await this.page
      .getByRole('combobox', { name: 'Sort by' })
      .selectOption(option)
  }

  async submitSort() {
    await this.page.getByRole('button', { name: 'Sort', exact: true }).click()
  }

  async goToResultsPage(number: string) {
    await this.page
      .getByRole('navigation', { name: 'Search result pages' })
      .getByRole('link', { name: number })
      .click()
  }

  async setMinimumRating(rating: string) {
    await this.page
      .getByRole('combobox', { name: 'Minimum rating' })
      .selectOption(rating)
  }

  async applyFilters() {
    await this.page.getByRole('button', { name: 'Apply filters' }).click()
  }
}

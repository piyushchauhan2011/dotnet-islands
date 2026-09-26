import type { Page } from '@playwright/test'

export class AdminPage {
  readonly robots
  readonly siteHeader
  readonly siteFooter
  readonly welcomeHeading
  readonly main
  readonly canonical
  readonly mobileMenu
  readonly noJavaScriptWarning
  readonly dashboardStats
  readonly guestInquiriesHeading
  readonly emptyInquiries
  readonly tableRows
  readonly sectionHeading
  readonly editorForm

  constructor(private readonly page: Page) {
    this.robots = page.locator('meta[name="robots"]')
    this.siteHeader = page.locator('header.site-header')
    this.siteFooter = page.locator('footer.site-footer')
    this.welcomeHeading = page.locator('#main h1')
    this.main = page.locator('main')
    this.canonical = page.locator('link[rel="canonical"]')
    this.mobileMenu = page.getByRole('navigation', {
      name: 'Mobile navigation',
    })
    this.noJavaScriptWarning = page.locator(
      '#admin-root noscript .notification',
    )
    this.dashboardStats = page.locator('.admin-dashboard__stats')
    this.guestInquiriesHeading = page.getByRole('heading', {
      name: 'Guest inquiries',
    })
    this.emptyInquiries = page.getByText('No inquiries yet.')
    this.tableRows = page.locator('table tbody tr')
    this.sectionHeading = page.locator('.admin-shell__header h1')
    this.editorForm = page.locator('.admin-content-form')
  }

  async openAdmin() {
    await this.page.goto('/admin')
  }

  async openLogin() {
    await this.page.goto('/admin/login')
  }

  async openNewHotel() {
    await this.page.goto('/admin/hotels/new')
  }

  async openMedia() {
    await this.page.goto('/admin/media')
  }

  async openMobileMenu() {
    await this.mobileMenu.getByText('Menu', { exact: true }).click()
  }

  async signIn(email: string, password: string) {
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email)
    await this.page.getByLabel('Password').fill(password)
    await this.page.getByRole('button', { name: 'Sign in' }).click()
  }

  async openInquiries() {
    await this.page.getByRole('link', { name: 'Inquiries' }).click()
  }

  async openHotels() {
    await this.page
      .getByRole('navigation', { name: 'Admin navigation' })
      .getByRole('link', { name: 'Hotels' })
      .click()
  }

  async editFirstHotel() {
    await this.tableRows.first().getByRole('button', { name: 'Edit' }).click()
  }

  async signOut() {
    await this.page.getByRole('button', { name: 'Sign out' }).click()
  }
}

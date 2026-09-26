import type { Locator, Page } from '@playwright/test'

export class InquiryPage {
  readonly roomPath =
    '/inquire?hotel=hotel-bengaluru-jayanagar&room=hotel-bengaluru-female-dorm'
  readonly intro: Locator
  readonly heading: Locator
  readonly selectedStay: Locator
  readonly form: Locator
  readonly calendar: Locator
  readonly missingCheckInMessage: Locator
  readonly footer: Locator

  constructor(readonly page: Page) {
    this.intro = page.locator('.inquiry-page__intro')
    this.heading = this.intro.getByRole('heading', { level: 1 })
    this.selectedStay = page.locator('.inquiry-page__hotel')
    this.form = page.locator('.inquiry-page__form .inquiry-page__card')
    this.calendar = page.getByRole('dialog', { name: 'Choose date calendar' })
    this.missingCheckInMessage = page.getByText(
      'Choose a check-in date today or later.',
    )
    this.footer = page.locator('.site-footer')
  }

  async gotoRoomInquiry() {
    await this.page.goto(this.roomPath)
  }

  async openCheckInCalendar() {
    await this.page.getByRole('button', { name: 'Check in' }).click()
  }

  async dismissCalendar() {
    await this.page.keyboard.press('Escape')
  }

  async fillContactDetails(name: string, email: string) {
    await this.page.getByLabel('Full name').fill(name)
    await this.page.getByLabel('Email').fill(email)
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Send inquiry' }).click()
  }
}

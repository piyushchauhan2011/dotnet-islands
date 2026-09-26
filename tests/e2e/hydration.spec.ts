import { expect, test } from '@playwright/test'
import { HomePage } from './pages/home'

test('published pages contain one hydrated representation of each island', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/hotels/casa-aurelia')).text()
  const searchHtml = await (await request.get('/')).text()
  const staticMarkup = await page.evaluate(
    ([hotelHtml, homeHtml]) => {
      const hotel = new DOMParser().parseFromString(hotelHtml, 'text/html')
      const home = new DOMParser().parseFromString(homeHtml, 'text/html')
      return {
        fallbacks:
          hotel.querySelectorAll('[data-fallback-for]').length +
          home.querySelectorAll('[data-fallback-for]').length,
        gallery: hotel.querySelectorAll('[data-island="Gallery"] .gallery-grid')
          .length,
        navigation: hotel.querySelectorAll('[data-island="MobileNav"] button')
          .length,
        search: home.querySelectorAll('[data-island="SearchForm"] form').length,
      }
    },
    [html, searchHtml],
  )
  expect(staticMarkup).toEqual({
    fallbacks: 0,
    gallery: 1,
    navigation: 1,
    search: 1,
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const response = await page.goto('/hotels/casa-aurelia')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['x-snapshot-version']).toMatch(/^[a-f0-9]{64}$/)
  await expect(page.locator('main h1')).toHaveText('Casa Aurelia')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/hotels\/casa-aurelia$/,
  )
  await expect(
    page.locator('[data-island="Gallery"] .gallery-grid'),
  ).toHaveCount(1)
  await page
    .getByRole('button', {
      name: 'Open Casa Aurelia gallery image 1 — property',
    })
    .click()
  await expect(page.locator('dialog.gallery-lightbox')).toBeVisible()
  await page.getByRole('button', { name: 'Next photo' }).click()
  await expect(page.locator('.gallery-lightbox__heading')).toContainText(
    '2 of 3',
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog.gallery-lightbox')).not.toBeVisible()
  const home = new HomePage(page)
  await home.open()
  await expect(home.searchForm).toBeVisible()
  expect(errors).toEqual([])
})

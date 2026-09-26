import { SlidersHorizontal } from 'lucide-react'

export type SearchFilters = {
  destination?: string | null
  query?: string | null
  checkIn?: string | null
  checkOut?: string | null
  adults?: number
  children?: number
  minPrice?: number | null
  maxPrice?: number | null
  rating?: number | null
  amenities?: string[]
  offers?: boolean
  sort?: string
  page?: number
}
type SearchExperienceProps = {
  filters: SearchFilters
  amenities: { id: string; name: string }[]
}

export default function SearchExperience({
  filters,
  amenities,
}: SearchExperienceProps) {
  return (
    <aside className="card search-page__filters">
      <header className="search-page__filters-header">
        <h2 className="search-page__filters-title">
          <SlidersHorizontal aria-hidden="true" /> Filters
        </h2>
      </header>
      <div className="card-content">
        <form action="/search" method="get" aria-label="Filter hotels">
          {(['destination', 'checkIn', 'checkOut'] as const).map((field) => (
            <input
              key={field}
              type="hidden"
              name={field}
              value={filters[field] ?? ''}
            />
          ))}
          <input type="hidden" name="adults" value={filters.adults ?? 2} />
          <input type="hidden" name="children" value={filters.children ?? 0} />
          <input
            type="hidden"
            name="sort"
            value={filters.sort ?? 'relevance'}
          />
          <input type="hidden" name="page" value="1" />
          <div className="field">
            <label className="label" htmlFor="hotel-query">
              Search by name
            </label>
            <div className="control">
              <input
                className="input"
                id="hotel-query"
                name="query"
                defaultValue={filters.query ?? ''}
                placeholder="Hotel or neighborhood"
              />
            </div>
          </div>
          <div className="search-page__price-fields">
            <div className="field">
              <label className="label" htmlFor="min-price">
                Min price
              </label>
              <div className="control">
                <input
                  className="input"
                  id="min-price"
                  type="number"
                  name="minPrice"
                  min="0"
                  defaultValue={filters.minPrice ?? ''}
                />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="max-price">
                Max price
              </label>
              <div className="control">
                <input
                  className="input"
                  id="max-price"
                  type="number"
                  name="maxPrice"
                  min="0"
                  defaultValue={filters.maxPrice ?? ''}
                />
              </div>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="minimum-rating">
              Minimum rating
            </label>
            <div className="select is-fullwidth">
              <select
                id="minimum-rating"
                name="rating"
                defaultValue={filters.rating ?? ''}
              >
                <option value="">Any rating</option>
                <option value="4.5">4.5+</option>
                <option value="4.7">4.7+</option>
                <option value="4.8">4.8+</option>
              </select>
            </div>
          </div>
          <fieldset>
            <legend>Amenities</legend>
            <div className="search-page__checks">
              {amenities.map((amenity) => (
                <label className="checkbox" key={amenity.id}>
                  <input
                    type="checkbox"
                    name="amenities"
                    value={amenity.id}
                    defaultChecked={filters.amenities?.includes(amenity.id)}
                  />{' '}
                  {amenity.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="checkbox">
            <input
              type="checkbox"
              name="offers"
              value="true"
              defaultChecked={filters.offers}
            />{' '}
            Offers available
          </label>
          <button className="button is-primary is-fullwidth" type="submit">
            Apply filters
          </button>
        </form>
      </div>
    </aside>
  )
}

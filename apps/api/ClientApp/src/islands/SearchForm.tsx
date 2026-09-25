import { MapPin, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { DatePicker } from './DatePicker'

export type SearchInitial = {
  destination?: string
  query?: string
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
}
export type DestinationOption = { slug: string; name: string }
export type SearchFormProps = {
  destinations: DestinationOption[]
  initial?: SearchInitial
  compact?: boolean
}

export default function SearchForm({
  destinations,
  initial = {},
  compact = false,
}: SearchFormProps) {
  const [checkIn, setCheckIn] = useState(initial.checkIn ?? '')
  const [checkOut, setCheckOut] = useState(initial.checkOut ?? '')
  return (
    <form
      className={`search-form${compact ? ' search-form--compact' : ''}`}
      action="/search"
      method="get"
      aria-label="Search hotels"
    >
      <div className="search-form__field search-form__field--destination">
        <label className="label" htmlFor="search-destination">
          <MapPin aria-hidden="true" /> Destination
        </label>
        <div className="select">
          <select
            id="search-destination"
            name="destination"
            defaultValue={initial.destination ?? ''}
          >
            <option value="">Anywhere</option>
            {destinations.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="search-form__field">
        <label className="label" htmlFor="search-check-in">
          Check in
        </label>
        <DatePicker
          id="search-check-in"
          name="checkIn"
          value={checkIn}
          onValueChange={(date) => {
            setCheckIn(date)
            if (checkOut && date >= checkOut) setCheckOut('')
          }}
          placeholder="Add date"
        />
      </div>
      <div className="search-form__field">
        <label className="label" htmlFor="search-check-out">
          Check out
        </label>
        <DatePicker
          id="search-check-out"
          name="checkOut"
          value={checkOut}
          min={
            checkIn
              ? new Date(`${checkIn}T12:00:00`).toLocaleDateString('en-CA')
              : undefined
          }
          onValueChange={setCheckOut}
          placeholder="Add date"
        />
      </div>
      <div className="search-form__field">
        <label className="label" htmlFor="search-adults">
          <Users aria-hidden="true" /> Guests
        </label>
        <div className="select">
          <select
            id="search-adults"
            name="adults"
            defaultValue={initial.adults ?? 2}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((n) => (
              <option key={n} value={n}>
                {n} adult{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>
      </div>
      <input type="hidden" name="children" value={initial.children ?? 0} />
      <input type="hidden" name="sort" value="relevance" />
      <input type="hidden" name="page" value="1" />
      <button
        type="submit"
        className="button is-primary search-form__submit"
        aria-label="Search hotels"
      >
        <Search aria-hidden="true" />
        <span>Search</span>
      </button>
    </form>
  )
}

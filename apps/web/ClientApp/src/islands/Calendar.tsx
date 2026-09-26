import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import type { ComponentProps } from 'react'
import 'react-day-picker/style.css'

export default function Calendar({
  selected,
  onSelect,
  disabled,
}: {
  selected?: Date
  disabled?: ComponentProps<typeof DayPicker>['disabled']
  onSelect: (date: Date | undefined) => void
}) {
  return (
    <DayPicker
      mode="single"
      selected={selected}
      disabled={disabled}
      onSelect={onSelect}
      autoFocus
      showOutsideDays
      className="date-picker-calendar"
      components={{
        Chevron: ({ orientation, ...props }) =>
          orientation === 'left' ? (
            <ChevronLeft aria-hidden="true" {...props} />
          ) : orientation === 'right' ? (
            <ChevronRight aria-hidden="true" {...props} />
          ) : (
            <ChevronDown aria-hidden="true" {...props} />
          ),
      }}
    />
  )
}

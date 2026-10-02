/** @jsxImportSource preact */
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-preact'
import { DayPicker } from 'react-day-picker'
import type { DayPickerProps } from 'react-day-picker'
import type { FunctionComponent } from 'preact'
import 'react-day-picker/style.css'

const CompatibleDayPicker =
  DayPicker as unknown as FunctionComponent<DayPickerProps>

export default function Calendar({
  selected,
  onSelect,
  disabled,
}: {
  selected?: Date
  disabled?: DayPickerProps['disabled']
  onSelect: (date: Date | undefined) => void
}) {
  return (
    <CompatibleDayPicker
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

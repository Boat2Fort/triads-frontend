import { Directive, HostBinding, HostListener, inject } from '@angular/core'
import { NgControl } from '@angular/forms'

@Directive({
	selector: '[appAutoCapitalize]',
})
export class AutoCapitalize {
	@HostBinding('style.textTransform') textTransform = 'uppercase'

	@HostBinding('attr.autocapitalize') autocapitalize = 'characters'

	private readonly ngControl = inject(NgControl, { optional: true, self: true })

	@HostListener('input', ['$event'])
	onInput(event: Event) {
		const target = event.target as HTMLInputElement
		const value = target.value
		const upperValue = value.toUpperCase()
		const start = target.selectionStart
		const end = target.selectionEnd
		const direction = target.selectionDirection

		if (value !== upperValue) {
			// Other input listeners (including the form value accessor) read this same element.
			target.value = upperValue
			if (start !== null && end !== null) {
				// Uppercasing can expand characters, so map both selection offsets.
				target.setSelectionRange(value.slice(0, start).toUpperCase().length, value.slice(0, end).toUpperCase().length, direction ?? 'none')
			}
		}

		if (this.ngControl?.control) {
			this.ngControl.control.setValue(upperValue, { emitEvent: false, emitModelToViewChange: false })
		}
	}
}

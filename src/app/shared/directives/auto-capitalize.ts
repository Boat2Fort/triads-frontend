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
		const upperValue = target.value.toUpperCase()
		// Other input listeners (including the form value accessor) read this same element.
		target.value = upperValue

		if (this.ngControl?.control) {
			this.ngControl.control.setValue(upperValue, { emitEvent: false, emitModelToViewChange: false })
		}
	}
}

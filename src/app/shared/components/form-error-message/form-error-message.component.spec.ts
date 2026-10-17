import { ComponentFixture, TestBed } from '@angular/core/testing'
import { FormControl, Validators } from '@angular/forms'

import { FormErrorMessageComponent } from './form-error-message.component'

describe('FormErrorMessageComponent', () => {
	let component: FormErrorMessageComponent
	let fixture: ComponentFixture<FormErrorMessageComponent>
	let control: FormControl

	beforeEach(async () => {
		control = new FormControl('', Validators.required)
		await TestBed.configureTestingModule({
			imports: [FormErrorMessageComponent],
		}).compileComponents()

		fixture = TestBed.createComponent(FormErrorMessageComponent)
		component = fixture.componentInstance
		fixture.componentRef.setInput('control', control)
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	it('should show server error message for dirty controls', () => {
		control.setErrors({ server: 'Invalid keyword' })
		control.markAsDirty()
		fixture.detectChanges()

		expect(component.message()).toBe('Invalid keyword')
	})

	it('should hide errors for pristine controls', () => {
		control.setErrors({ required: true })
		fixture.detectChanges()

		expect(component.message()).toBeNull()
	})
})

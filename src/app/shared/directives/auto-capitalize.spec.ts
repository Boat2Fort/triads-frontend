import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

import { AutoCapitalize } from './auto-capitalize'

@Component({ imports: [AutoCapitalize, ReactiveFormsModule], template: '<input appAutoCapitalize [formControl]="answer" />' })
class Host {
	answer = new FormControl('')
}

describe('AutoCapitalize', () => {
	it('preserves the caret while replacing the first word of a phrase', async () => {
		await TestBed.configureTestingModule({ imports: [Host] }).compileComponents()
		const fixture = TestBed.createComponent(Host)
		fixture.componentInstance.answer.setValue('RED APPLE')
		fixture.detectChanges()
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input')
		input.setSelectionRange(0, 3)

		for (const [index, character] of [...'blue'].entries()) {
			input.setRangeText(character, input.selectionStart!, input.selectionEnd!, 'end')
			input.dispatchEvent(new Event('input', { bubbles: true }))
			fixture.detectChanges()
			const expected = `${'BLUE'.slice(0, index + 1)} APPLE`
			expect(input.value).toBe(expected)
			expect(fixture.componentInstance.answer.value).toBe(expected)
			expect(input.selectionStart).toBe(index + 1)
			expect(input.selectionEnd).toBe(index + 1)
		}
	})

	it('maps a backward selection through uppercase characters that expand', async () => {
		await TestBed.configureTestingModule({ imports: [Host] }).compileComponents()
		const fixture = TestBed.createComponent(Host)
		fixture.detectChanges()
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input')
		input.value = 'aß apple'
		input.setSelectionRange(1, 2, 'backward')
		input.dispatchEvent(new Event('input', { bubbles: true }))
		fixture.detectChanges()
		expect(input.value).toBe('ASS APPLE')
		expect(fixture.componentInstance.answer.value).toBe('ASS APPLE')
		expect(input.selectionStart).toBe(1)
		expect(input.selectionEnd).toBe(3)
		expect(input.selectionDirection).toBe('backward')
	})

	it('uppercases an answer entered through the form control', async () => {
		await TestBed.configureTestingModule({ imports: [Host] }).compileComponents()
		const fixture = TestBed.createComponent(Host)
		fixture.detectChanges()
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input')
		input.value = 'button'
		input.dispatchEvent(new Event('input'))
		expect(fixture.componentInstance.answer.value).toBe('BUTTON')
	})
})

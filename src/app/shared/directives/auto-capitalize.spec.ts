import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

import { AutoCapitalize } from './auto-capitalize'

@Component({ imports: [AutoCapitalize, ReactiveFormsModule], template: '<input appAutoCapitalize [formControl]="answer" />' })
class Host {
	answer = new FormControl('')
}

describe('AutoCapitalize', () => {
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

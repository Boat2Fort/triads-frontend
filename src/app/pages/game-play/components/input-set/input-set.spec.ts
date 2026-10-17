import { ComponentFixture, TestBed } from '@angular/core/testing'

import { InputSet } from './input-set'

describe('InputSet', () => {
	let component: InputSet
	let fixture: ComponentFixture<InputSet>

	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [InputSet] }).compileComponents()
		fixture = TestBed.createComponent(InputSet)
		fixture.componentRef.setInput('quantity', 6)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('creates the required number of letter controls', () => {
		expect(component.inputBoxes.length).toBe(6)
	})

	it('submits a complete answer and ignores incomplete input', () => {
		const answers: string[] = []
		component.whenSubmitClicked.subscribe((answer) => answers.push(answer))
		component.submitAnswer()
		component.inputBoxes.setValue(['B', 'U', 'T', 'T', 'O', 'N'])
		component.submitAnswer()
		expect(answers).toEqual(['BUTTON'])
	})

	it('applies a first-letter hint to an existing input set', () => {
		fixture.componentRef.setInput('firstLetter', 'B')
		fixture.detectChanges()
		expect(component.inputBoxes.at(0).value).toBe('B')
	})

	it('does not submit while checking an answer', () => {
		const answers: string[] = []
		component.whenSubmitClicked.subscribe((answer) => answers.push(answer))
		component.inputBoxes.setValue(['B', 'U', 'T', 'T', 'O', 'N'])
		fixture.componentRef.setInput('isLoading', true)
		fixture.detectChanges()
		component.submitAnswer()
		expect(answers).toEqual([])
	})
})

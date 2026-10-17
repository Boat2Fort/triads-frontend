import { ComponentFixture, TestBed } from '@angular/core/testing'

import { SolvedTriad } from './solved-triad'

describe('SolvedTriad', () => {
	let component: SolvedTriad
	let fixture: ComponentFixture<SolvedTriad>

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [SolvedTriad],
		}).compileComponents()

		fixture = TestBed.createComponent(SolvedTriad)
		fixture.componentRef.setInput('solvedTriad', {
			id: 1,
			keyword: 'BUTTON',
			cues: ['PUSH-', 'CAMPAIGN', 'PANIC'],
			fullPhrases: ['PUSH-BUTTON', 'CAMPAIGN BUTTON', 'PANIC BUTTON'],
		})
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

import { ComponentFixture, TestBed } from '@angular/core/testing'

import { BubbleContainer } from './bubble-container'

describe('BubbleContainer', () => {
	let component: BubbleContainer
	let fixture: ComponentFixture<BubbleContainer>

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [BubbleContainer],
		}).compileComponents()

		fixture = TestBed.createComponent(BubbleContainer)
		fixture.componentRef.setInput('cues', [])
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

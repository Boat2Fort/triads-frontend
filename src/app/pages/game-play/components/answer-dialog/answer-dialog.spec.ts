import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideLottieOptions } from 'ngx-lottie'

import { AnswerDialog } from './answer-dialog'

describe('AnswerDialog', () => {
	let component: AnswerDialog
	let fixture: ComponentFixture<AnswerDialog>

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [AnswerDialog],
			providers: [provideLottieOptions({ player: () => import('lottie-web') })],
		}).compileComponents()

		fixture = TestBed.createComponent(AnswerDialog)
		fixture.componentRef.setInput('type', 'CORRECT')
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

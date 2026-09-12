import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ReactiveFormsModule } from '@angular/forms'

import { TriadValidationService } from '../../services/triad-validation.service'
import { AddTriadGroupDialog } from './add-triad-group-dialog'

describe('AddTriadGroupDialog', () => {
	let component: AddTriadGroupDialog
	let fixture: ComponentFixture<AddTriadGroupDialog>

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [AddTriadGroupDialog, ReactiveFormsModule],
			providers: [TriadValidationService],
		}).compileComponents()

		fixture = TestBed.createComponent(AddTriadGroupDialog)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	it('should emit whenCanceled on close', () => {
		spyOn(component.whenCanceled, 'emit')
		component.onClose()
		expect(component.whenCanceled.emit).toHaveBeenCalled()
	})

	it('should validate and emit whenCreated on valid submit', () => {
		// Fill form with valid data
		component.formGroup.patchValue({
			difficulty: 'EASY',
			triad1: { keyword: 'TEST', fullPhrase1: 'TEST1', fullPhrase2: 'TEST2', fullPhrase3: 'TEST3' },
			triad2: { keyword: 'SAMPLE', fullPhrase1: 'SAMPLE1', fullPhrase2: 'SAMPLE2', fullPhrase3: 'SAMPLE3' },
			triad3: { keyword: 'DEMO', fullPhrase1: 'DEMO1', fullPhrase2: 'DEMO2', fullPhrase3: 'DEMO3' },
			triad4: { keyword: 'FINAL', fullPhrase1: 'TEST FINAL', fullPhrase2: 'SAMPLE FINAL', fullPhrase3: 'DEMO FINAL' },
		})

		spyOn(component.whenCreated, 'emit')
		component.onSubmit()
		expect(component.whenCreated.emit).toHaveBeenCalled()
	})
})

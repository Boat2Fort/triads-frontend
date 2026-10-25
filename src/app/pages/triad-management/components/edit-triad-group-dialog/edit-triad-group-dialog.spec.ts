import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ReactiveFormsModule } from '@angular/forms'

import { TriadGroup } from '../../interfaces/triad-group.interface'
import { TriadValidationService } from '../../services/triad-validation.service'
import { EditTriadGroupDialog } from './edit-triad-group-dialog'

describe('EditTriadGroupDialog', () => {
	let component: EditTriadGroupDialog
	let fixture: ComponentFixture<EditTriadGroupDialog>

	const mockTriadGroup: TriadGroup = {
		id: 1,
		active: true,
		difficulty: 'EASY',
		triad1: { id: 10, keyword: 'TEST', cues: ['TEST1', 'TEST2', 'TEST3'], fullPhrases: ['TEST1', 'TEST2', 'TEST3'] },
		triad2: { id: 20, keyword: 'SAMPLE', cues: ['SAMPLE1', 'SAMPLE2', 'SAMPLE3'], fullPhrases: ['SAMPLE1', 'SAMPLE2', 'SAMPLE3'] },
		triad3: { id: 30, keyword: 'DEMO', cues: ['DEMO1', 'DEMO2', 'DEMO3'], fullPhrases: ['DEMO1', 'DEMO2', 'DEMO3'] },
		triad4: { id: 40, keyword: 'FINAL', cues: ['TEST', 'SAMPLE', 'DEMO'], fullPhrases: ['TEST FINAL', 'SAMPLE FINAL', 'DEMO FINAL'] },
	}

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [EditTriadGroupDialog, ReactiveFormsModule],
			providers: [TriadValidationService],
		}).compileComponents()

		fixture = TestBed.createComponent(EditTriadGroupDialog)
		component = fixture.componentInstance
		fixture.componentRef.setInput('triadGroup', mockTriadGroup)
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	it('should populate form with triad group data', () => {
		expect(component.triad1Group.get('keyword')?.value).toBe('TEST')
		expect(component.triad1Group.get('fullPhrase1')?.value).toBe('TEST1')
		expect(component.triad2Group.get('keyword')?.value).toBe('SAMPLE')
		expect(component.triad4Group.get('fullPhrase1')?.value).toBe('TEST FINAL')
	})

	it('should emit whenCanceled on close', () => {
		spyOn(component.whenCanceled, 'emit')
		component.onClose()
		expect(component.whenCanceled.emit).toHaveBeenCalled()
	})

	it('keeps typing in the first word of a two-word phrase', () => {
		const control = component.triad1Group.controls['fullPhrase1']
		control.setValue('RED APPLE')
		fixture.detectChanges()
		const input: HTMLInputElement = fixture.nativeElement.querySelector('#edit-triad1-fullPhrase1')
		input.focus()
		input.setSelectionRange(0, 3)

		for (const [index, character] of [...'blue'].entries()) {
			input.setRangeText(character, input.selectionStart!, input.selectionEnd!, 'end')
			input.dispatchEvent(new Event('input', { bubbles: true }))
			fixture.detectChanges()
			const expected = `${'BLUE'.slice(0, index + 1)} APPLE`
			expect(input.value).toBe(expected)
			expect(control.value).toBe(expected)
			expect(input.selectionStart).toBe(index + 1)
			expect(input.selectionEnd).toBe(index + 1)
		}
	})

	it('should validate and emit whenSaved on valid submit', () => {
		spyOn(component.whenSaved, 'emit')
		component.onSubmit()
		expect(component.whenSaved.emit).toHaveBeenCalled()
	})
})

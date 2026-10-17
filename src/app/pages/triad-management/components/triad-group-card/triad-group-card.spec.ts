import { ComponentFixture, TestBed } from '@angular/core/testing'

import { TriadGroup } from '../../interfaces/triad-group.interface'
import { TriadGroupCard } from './triad-group-card'

describe('TriadGroupCard', () => {
	let component: TriadGroupCard
	let fixture: ComponentFixture<TriadGroupCard>

	const mockTriadGroup: TriadGroup = {
		id: 1,
		active: true,
		difficulty: 'EASY',
		triad1: { id: 10, keyword: 'TEST', cues: ['TEST1', 'TEST2', 'TEST3'], fullPhrases: ['TEST FIRST', 'SAMPLE SECOND', 'DEMO THIRD'] },
		triad2: { id: 20, keyword: 'SAMPLE', cues: ['SAMPLE1', 'SAMPLE2', 'SAMPLE3'], fullPhrases: ['TEST FIRST', 'SAMPLE SECOND', 'DEMO THIRD'] },
		triad3: { id: 30, keyword: 'DEMO', cues: ['DEMO1', 'DEMO2', 'DEMO3'], fullPhrases: ['TEST FIRST', 'SAMPLE SECOND', 'DEMO THIRD'] },
		triad4: { id: 40, keyword: 'FINAL', cues: ['TEST', 'SAMPLE', 'DEMO'], fullPhrases: ['TEST FIRST', 'SAMPLE SECOND', 'DEMO THIRD'] },
	}

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [TriadGroupCard],
		}).compileComponents()

		fixture = TestBed.createComponent(TriadGroupCard)
		component = fixture.componentInstance
		fixture.componentRef.setInput('triadGroup', mockTriadGroup)
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	it('should emit editClicked when edit button is clicked', () => {
		spyOn(component.editClicked, 'emit')
		component.onEdit()
		expect(component.editClicked.emit).toHaveBeenCalledWith(mockTriadGroup)
	})

	it('should emit deleteClicked when delete button is clicked', () => {
		spyOn(component.deleteClicked, 'emit')
		component.onDelete()
		expect(component.deleteClicked.emit).toHaveBeenCalledWith(1)
	})

	it('should emit toggleStatusClicked when toggle button is clicked', () => {
		spyOn(component.toggleStatusClicked, 'emit')
		component.onToggleStatus()
		expect(component.toggleStatusClicked.emit).toHaveBeenCalledWith({ id: 1, active: false })
	})
})

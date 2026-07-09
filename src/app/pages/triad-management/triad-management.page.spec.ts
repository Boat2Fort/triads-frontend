import { HttpClientTestingModule } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { of, throwError } from 'rxjs'

import { DailyScheduleAdminApi } from '../../shared/services/daily-schedule-admin-api'
import { SnackbarService } from '../../shared/services/snackbar.service'
import { TriadGroup, TriadGroupFormData } from './interfaces/triad-group.interface'
import { TriadManagementApi } from './services/triad-management-api'
import { TriadManagementPage } from './triad-management.page'

describe('TriadManagementPage', () => {
	let component: TriadManagementPage
	let fixture: ComponentFixture<TriadManagementPage>
	let api: jasmine.SpyObj<TriadManagementApi>
	let dailyScheduleApi: jasmine.SpyObj<DailyScheduleAdminApi>
	let snackbar: jasmine.SpyObj<SnackbarService>

	const triadGroup = (id: number, keyword: string): TriadGroup => ({
		id,
		active: true,
		difficulty: 'EASY',
		triad1: { id: id * 10 + 1, keyword, cues: [`${keyword} cue 1`], fullPhrases: [] },
		triad2: { id: id * 10 + 2, keyword: `${keyword} 2`, cues: [`${keyword} cue 2`], fullPhrases: [] },
		triad3: { id: id * 10 + 3, keyword: `${keyword} 3`, cues: [`${keyword} cue 3`], fullPhrases: [] },
		triad4: { id: id * 10 + 4, keyword: `${keyword} 4`, cues: [`${keyword} cue 4`], fullPhrases: [] },
	})

	const formData: TriadGroupFormData = {
		difficulty: 'EASY',
		triad1: { keyword: 'alpha', fullPhrases: ['a one', 'a two', 'a three'] },
		triad2: { keyword: 'bravo', fullPhrases: ['b one', 'b two', 'b three'] },
		triad3: { keyword: 'charlie', fullPhrases: ['c one', 'c two', 'c three'] },
		triad4: { keyword: 'delta', fullPhrases: ['d one', 'd two', 'd three'] },
	}

	beforeEach(async () => {
		api = jasmine.createSpyObj<TriadManagementApi>('TriadManagementApi', [
			'getTriadGroups',
			'getTriadGroupStats',
			'createTriadGroup',
			'updateTriadGroup',
			'deleteTriadGroup',
			'toggleTriadGroupStatus',
		])
		dailyScheduleApi = jasmine.createSpyObj<DailyScheduleAdminApi>('DailyScheduleAdminApi', ['getSchedules', 'createSchedule', 'deleteSchedule'])
		snackbar = jasmine.createSpyObj<SnackbarService>('SnackbarService', ['showSnackbar'])

		api.getTriadGroups.and.returnValue(of([]))
		api.getTriadGroupStats.and.returnValue(of({ totalActive: 0, byDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 } }))
		dailyScheduleApi.getSchedules.and.returnValue(of([]))

		await TestBed.configureTestingModule({
			imports: [TriadManagementPage, HttpClientTestingModule],
			providers: [
				{ provide: TriadManagementApi, useValue: api },
				{ provide: DailyScheduleAdminApi, useValue: dailyScheduleApi },
				{ provide: SnackbarService, useValue: snackbar },
			],
		}).compileComponents()

		fixture = TestBed.createComponent(TriadManagementPage)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	it('reloads the first ordered page after creating a triad group', () => {
		const createdGroup = triadGroup(99, 'new unscheduled')
		api.createTriadGroup.and.returnValue(of(createdGroup))
		spyOn(component, 'loadTriadGroups')

		component.onAddDialogCreated(formData)

		expect(api.createTriadGroup).toHaveBeenCalledWith(formData)
		expect(component.loadTriadGroups).toHaveBeenCalledOnceWith(true)
		expect(snackbar.showSnackbar).toHaveBeenCalledWith('Triad group created successfully')
	})

	it('does not prepend a newly created unscheduled group into the loaded list', () => {
		const scheduledGroup = triadGroup(2, 'scheduled')
		const createdGroup = triadGroup(99, 'new unscheduled')
		component.triadGroups.set([scheduledGroup])
		api.createTriadGroup.and.returnValue(of(createdGroup))
		spyOn(component, 'loadTriadGroups')

		component.onAddDialogCreated(formData)

		expect(component.triadGroups()).toEqual([scheduledGroup])
		expect(component.loadTriadGroups).toHaveBeenCalledOnceWith(true)
	})

	it('displays active triad group inventory stats', () => {
		api.getTriadGroupStats.and.returnValue(of({ totalActive: 6, byDifficulty: { EASY: 2, MEDIUM: 1, HARD: 3 } }))

		component.loadTriadGroupStats()
		fixture.detectChanges()

		const text = fixture.nativeElement.textContent
		expect(text).toContain('Total')
		expect(text).toContain('Easy')
		expect(text).toContain('Medium')
		expect(text).toContain('Hard')
		expect(component.triadGroupStats().totalActive).toBe(6)
		expect(component.triadGroupStats().byDifficulty.HARD).toBe(3)
	})

	it('loads stats independently of search state', () => {
		component.searchQuery.set('apple')

		component.loadTriadGroupStats()

		expect(api.getTriadGroupStats).toHaveBeenCalledWith()
	})

	it('loads all daily schedule pages for assigned schedule hints', () => {
		const firstPage = Array.from({ length: 100 }, (_, i) => ({
			id: i + 1,
			puzzleDate: `2026-08-${String((i % 30) + 1).padStart(2, '0')}`,
			triadGroupId: i + 1,
		}))
		const secondPage = [{ id: 101, puzzleDate: '2026-07-10', triadGroupId: 999 }]
		dailyScheduleApi.getSchedules.calls.reset()
		dailyScheduleApi.getSchedules.and.returnValues(of(firstPage), of(secondPage))

		component.loadDailySchedules()

		expect(dailyScheduleApi.getSchedules.calls.allArgs()).toEqual([
			[0, 100],
			[100, 100],
		])
		expect(component.scheduleHintForGroup(999)).toEqual({ dateYmd: '2026-07-10', rowId: 101 })
	})

	it('uses the single assigned date from the schedule feed as the schedule hint', () => {
		dailyScheduleApi.getSchedules.calls.reset()
		dailyScheduleApi.getSchedules.and.returnValue(of([{ id: 9, puzzleDate: '2026-07-12', triadGroupId: 42 }]))

		component.loadDailySchedules()

		expect(component.scheduleHintForGroup(42)).toEqual({ dateYmd: '2026-07-12', rowId: 9 })
	})

	it('refreshes stats after creating a triad group', () => {
		const createdGroup = triadGroup(99, 'new unscheduled')
		api.createTriadGroup.and.returnValue(of(createdGroup))
		spyOn(component, 'loadTriadGroupStats')

		component.onAddDialogCreated(formData)

		expect(component.loadTriadGroupStats).toHaveBeenCalled()
	})

	it('refreshes stats after editing a triad group', () => {
		const existingGroup = triadGroup(1, 'existing')
		const updatedGroup = { ...existingGroup, difficulty: 'HARD' }
		component.selectedTriadGroup.set(existingGroup)
		api.updateTriadGroup.and.returnValue(of(updatedGroup))
		spyOn(component, 'loadTriadGroupStats')

		component.onEditDialogSaved(formData)

		expect(api.updateTriadGroup).toHaveBeenCalledWith(existingGroup.id, formData)
		expect(component.loadTriadGroupStats).toHaveBeenCalled()
	})

	it('reloads the first ordered page after editing a triad group', () => {
		const existingGroup = triadGroup(1, 'existing')
		const updatedGroup = { ...existingGroup, difficulty: 'HARD' }
		component.selectedTriadGroup.set(existingGroup)
		api.updateTriadGroup.and.returnValue(of(updatedGroup))
		spyOn(component, 'loadTriadGroups')

		component.onEditDialogSaved(formData)

		expect(component.loadTriadGroups).toHaveBeenCalledOnceWith(true)
	})

	it('refreshes stats after deleting a triad group', () => {
		component.deleteTargetId.set(1)
		api.deleteTriadGroup.and.returnValue(of(undefined))
		spyOn(component, 'loadTriadGroupStats')

		component.onDeleteConfirmed()

		expect(api.deleteTriadGroup).toHaveBeenCalledWith(1)
		expect(component.loadTriadGroupStats).toHaveBeenCalled()
	})

	it('refreshes stats after toggling a triad group active state', () => {
		const updatedGroup = { ...triadGroup(1, 'existing'), active: false }
		api.toggleTriadGroupStatus.and.returnValue(of(updatedGroup))
		spyOn(component, 'loadTriadGroupStats')

		component.onToggleStatus(1, false)

		expect(api.toggleTriadGroupStatus).toHaveBeenCalledWith(1, false)
		expect(component.loadTriadGroupStats).toHaveBeenCalled()
	})

	it('reloads the first ordered page after scheduling a daily puzzle', () => {
		const group = triadGroup(1, 'scheduled')
		dailyScheduleApi.createSchedule.and.returnValue(of({ id: 7, puzzleDate: '2026-07-10', triadGroupId: group.id }))
		spyOn(component, 'loadDailySchedules')
		spyOn(component, 'loadTriadGroups')

		component.onDailyScheduleSubmit({ triadGroup: group, puzzleDate: '2026-07-10' })

		expect(dailyScheduleApi.createSchedule).toHaveBeenCalledWith('2026-07-10', group.id)
		expect(component.loadDailySchedules).toHaveBeenCalled()
		expect(component.loadTriadGroups).toHaveBeenCalledOnceWith(true)
	})

	it('reloads the first ordered page after removing a daily schedule', () => {
		dailyScheduleApi.deleteSchedule.and.returnValue(of(undefined))
		spyOn(component, 'loadDailySchedules')
		spyOn(component, 'loadTriadGroups')

		component.onUnscheduleDailyRow(7)

		expect(dailyScheduleApi.deleteSchedule).toHaveBeenCalledWith(7)
		expect(component.loadDailySchedules).toHaveBeenCalled()
		expect(component.loadTriadGroups).toHaveBeenCalledOnceWith(true)
	})

	it('leaves schedule state for the interceptor when removing a schedule is rejected', () => {
		dailyScheduleApi.deleteSchedule.and.returnValue(throwError(() => new Error('Today and past daily schedules cannot be removed.')))
		spyOn(component, 'loadDailySchedules')
		spyOn(component, 'loadTriadGroups')

		component.onUnscheduleDailyRow(7)

		expect(dailyScheduleApi.deleteSchedule).toHaveBeenCalledWith(7)
		expect(component.loadDailySchedules).not.toHaveBeenCalled()
		expect(component.loadTriadGroups).not.toHaveBeenCalled()
	})
})

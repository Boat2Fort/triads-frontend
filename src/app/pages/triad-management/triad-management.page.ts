import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	inject,
	Injector,
	OnDestroy,
	OnInit,
	signal,
	viewChild,
} from '@angular/core'
import { IonModal } from '@ionic/angular/standalone'
import { Subject, takeUntil } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { minDailySchedulePuzzleDateYmd } from '../../shared/constants/daily-schedule.constant'
import { Difficulty } from '../../shared/enums/difficulty.enum'
import { ApiError } from '../../shared/errors/api-error.model'
import { isApiError, parseApiError } from '../../shared/errors/api-error.util'
import { DailyScheduleAdminApi, DailyScheduleRow } from '../../shared/services/daily-schedule-admin-api'
import { SnackbarService } from '../../shared/services/snackbar.service'
import { AddTriadGroupDialog } from './components/add-triad-group-dialog/add-triad-group-dialog'
import { DeleteConfirmationDialog } from './components/delete-confirmation-dialog/delete-confirmation-dialog'
import { EditTriadGroupDialog } from './components/edit-triad-group-dialog/edit-triad-group-dialog'
import { TriadDailyScheduleHint, TriadGroupCard } from './components/triad-group-card/triad-group-card'
import { TriadGroup, TriadGroupFormData, TriadGroupStats } from './interfaces/triad-group.interface'
import { TriadManagementApi } from './services/triad-management-api'

@Component({
	selector: 'app-triad-management',
	standalone: true,
	imports: [TriadGroupCard, AddTriadGroupDialog, EditTriadGroupDialog, DeleteConfirmationDialog, IonModal],
	templateUrl: './triad-management.page.html',
	styleUrl: './triad-management.page.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TriadManagementPage implements OnInit, OnDestroy {
	triadGroups = signal<TriadGroup[]>([])

	triadGroupStats = signal<TriadGroupStats>({
		totalActive: 0,
		byDifficulty: {
			EASY: 0,
			MEDIUM: 0,
			HARD: 0,
		},
	})

	isLoading = signal<boolean>(false)

	hasMore = signal<boolean>(true)

	searchQuery = signal<string>('')

	selectedDifficulty = signal<Difficulty | null>(null)

	showAddDialog = signal<boolean>(false)

	addDialogApiError = signal<ApiError | null>(null)

	addDialogSubmitting = signal(false)

	showEditDialog = signal<boolean>(false)

	editDialogApiError = signal<ApiError | null>(null)

	showDeleteConfirm = signal<boolean>(false)

	selectedTriadGroup = signal<TriadGroup | null>(null)

	deleteTargetId = signal<number | null>(null)

	dailySchedules = signal<DailyScheduleRow[]>([])

	/** Passed to triad cards to clear date inputs after a successful schedule. */
	scheduleDraftResetVersion = signal(0)

	isJumpingToScheduleBoundary = signal(false)

	isLoadingDailySchedules = signal(false)

	readonly Difficulty = Difficulty

	/** Assigned Eastern puzzle date per triad group (for display + unschedule). */
	readonly scheduleHintByGroupId = computed(() => {
		const rows = this.dailySchedules()
		const out = new Map<number, TriadDailyScheduleHint>()
		for (const r of rows) {
			out.set(r.triadGroupId, { dateYmd: r.puzzleDate, rowId: r.id })
		}
		return out
	})

	readonly firstAvailablePuzzleDateYmd = computed(() => {
		const today = minDailySchedulePuzzleDateYmd()
		const latestScheduleDate = this.dailySchedules().reduce((latest, row) => (row.puzzleDate.localeCompare(latest) > 0 ? row.puzzleDate : latest), '')
		if (!latestScheduleDate) {
			return today
		}

		const nextDate = this.addDaysToYmd(latestScheduleDate, 1)
		return nextDate.localeCompare(today) < 0 ? today : nextDate
	})

	private offset = 0

	private readonly limit = 20

	private readonly dailySchedulePageLimit = 100

	private dailySchedulesLoadVersion = 0

	private readonly destroy$ = new Subject<void>()

	private readonly searchSubject = new Subject<string>()

	private readonly injector = inject(Injector)

	private readonly api = inject(TriadManagementApi)

	private readonly dailyScheduleApi = inject(DailyScheduleAdminApi)

	private readonly snackbar = inject(SnackbarService)

	private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer')

	ngOnInit() {
		this.setupSearchDebounce()
		this.loadTriadGroups(true)
		this.loadTriadGroupStats()
		this.loadDailySchedules()
	}

	ngOnDestroy() {
		this.destroy$.next()
		this.destroy$.complete()
		this.searchSubject.complete()
	}

	onSearchInput(event: Event) {
		const value = (event.target as HTMLInputElement).value
		this.searchSubject.next(value)
	}

	onClearSearch() {
		this.searchSubject.next('')
	}

	onDifficultyFilterSelected(difficulty: Difficulty) {
		if (this.isLoading()) {
			return
		}

		this.selectedDifficulty.set(difficulty)
		this.loadTriadGroups(true)
	}

	onClearDifficultyFilter() {
		if (this.isLoading()) {
			return
		}

		this.selectedDifficulty.set(null)
		this.loadTriadGroups(true)
	}

	onJumpToScheduleBoundary() {
		if (this.isLoading() || this.isJumpingToScheduleBoundary() || this.isLoadingDailySchedules()) {
			return
		}

		this.searchQuery.set('')
		this.searchSubject.next('')
		this.selectedDifficulty.set(null)
		this.offset = 0
		this.triadGroups.set([])
		this.hasMore.set(true)
		this.isJumpingToScheduleBoundary.set(true)
		this.loadUntilScheduleBoundary(0, [])
	}

	loadTriadGroups(reset: boolean) {
		if (reset) {
			this.offset = 0
			this.triadGroups.set([])
		}

		if (this.isLoading()) {
			return
		}

		this.isLoading.set(true)

		this.api.getTriadGroups(this.offset, this.limit, this.searchQuery(), this.selectedDifficulty()).subscribe({
			next: (response) => {
				if (reset) {
					this.triadGroups.set(response)
				} else {
					this.triadGroups.update((groups) => [...groups, ...response])
				}
				// End-of-data detection: If response.length < limit, there are no more items
				this.hasMore.set(response.length >= this.limit)
				// Track offset: Increment offset by limit after each successful load
				this.offset += this.limit
				this.isLoading.set(false)
			},
			error: () => {
				this.isLoading.set(false)
			},
		})
	}

	onScroll() {
		if (this.isLoading() || !this.hasMore()) {
			return
		}

		const container = this.scrollContainer()?.nativeElement
		if (!container) {
			return
		}

		const scrollPosition = container.scrollTop + container.clientHeight
		const scrollHeight = container.scrollHeight

		if (scrollPosition >= scrollHeight - 200) {
			this.loadTriadGroups(false)
		}
	}

	onAdd() {
		this.addDialogApiError.set(null)
		this.addDialogSubmitting.set(false)
		this.showAddDialog.set(true)
	}

	onAddDialogCreated(data: TriadGroupFormData) {
		this.addDialogSubmitting.set(true)
		this.api.createTriadGroup(data).subscribe({
			next: () => {
				this.addDialogSubmitting.set(false)
				this.snackbar.showSnackbar('Triad group created successfully')
				this.showAddDialog.set(false)
				this.addDialogApiError.set(null)
				this.loadTriadGroups(true)
				this.loadTriadGroupStats()
			},
			error: (error) => {
				this.addDialogSubmitting.set(false)
				const apiError = this.toApiError(error)
				apiError.markHandled()
				this.addDialogApiError.set(apiError)
			},
		})
	}

	onAddDialogCanceled() {
		this.showAddDialog.set(false)
		this.addDialogApiError.set(null)
		this.addDialogSubmitting.set(false)
	}

	onEdit(triadGroup: TriadGroup) {
		this.editDialogApiError.set(null)
		this.selectedTriadGroup.set(triadGroup)
		this.showEditDialog.set(true)
	}

	onEditDialogSaved(data: TriadGroupFormData) {
		const group = this.selectedTriadGroup()
		if (!group) {
			return
		}

		this.api.updateTriadGroup(group.id, data).subscribe({
			next: () => {
				this.snackbar.showSnackbar('Triad group updated successfully')
				this.showEditDialog.set(false)
				this.editDialogApiError.set(null)
				this.selectedTriadGroup.set(null)
				this.loadTriadGroups(true)
				this.loadTriadGroupStats()
			},
			error: (error) => {
				const apiError = this.toApiError(error)
				apiError.markHandled()
				this.editDialogApiError.set(apiError)
			},
		})
	}

	onEditDialogCanceled() {
		this.showEditDialog.set(false)
		this.editDialogApiError.set(null)
		this.selectedTriadGroup.set(null)
	}

	onDelete(id: number) {
		this.deleteTargetId.set(id)
		this.showDeleteConfirm.set(true)
	}

	onDeleteConfirmed() {
		const id = this.deleteTargetId()
		if (!id) {
			return
		}

		this.api.deleteTriadGroup(id).subscribe({
			next: () => {
				this.snackbar.showSnackbar('Triad group deleted successfully')
				this.showDeleteConfirm.set(false)
				this.deleteTargetId.set(null)
				// Remove the deleted group from local state instead of refetching to preserve pagination
				this.triadGroups.update((groups) => groups.filter((g) => g.id !== id))
				this.loadTriadGroupStats()
			},
			error: () => {
				// Error message shown by HTTP interceptor
			},
		})
	}

	onDeleteCanceled() {
		this.showDeleteConfirm.set(false)
		this.deleteTargetId.set(null)
	}

	loadDailySchedules() {
		const loadVersion = ++this.dailySchedulesLoadVersion
		this.isLoadingDailySchedules.set(true)
		this.loadDailySchedulePage(0, [], loadVersion)
	}

	private loadDailySchedulePage(offset: number, accumulated: DailyScheduleRow[], loadVersion: number) {
		this.dailyScheduleApi.getSchedules(offset, this.dailySchedulePageLimit).subscribe({
			next: (rows) => {
				if (loadVersion !== this.dailySchedulesLoadVersion) {
					return
				}

				const schedules = [...accumulated, ...rows]
				if (rows.length >= this.dailySchedulePageLimit) {
					this.loadDailySchedulePage(offset + this.dailySchedulePageLimit, schedules, loadVersion)
					return
				}

				this.dailySchedules.set(schedules)
				this.isLoadingDailySchedules.set(false)
			},
			error: () => {
				if (loadVersion === this.dailySchedulesLoadVersion) {
					this.isLoadingDailySchedules.set(false)
				}
				// Error message shown by HTTP interceptor
			},
		})
	}

	loadTriadGroupStats() {
		this.api.getTriadGroupStats().subscribe({
			next: (stats) => {
				this.triadGroupStats.set(stats)
			},
			error: () => {
				// Error message shown by HTTP interceptor
			},
		})
	}

	scheduleHintForGroup(groupId: number): TriadDailyScheduleHint | null {
		return this.scheduleHintByGroupId().get(groupId) ?? null
	}

	onUnscheduleDailyRow(rowId: number) {
		this.dailyScheduleApi.deleteSchedule(rowId).subscribe({
			next: () => {
				this.snackbar.showSnackbar('Schedule entry removed')
				this.scheduleDraftResetVersion.update((v) => v + 1)
				this.loadDailySchedules()
				this.loadTriadGroups(true)
			},
			error: () => {
				// Error message shown by HTTP interceptor
			},
		})
	}

	onDailyScheduleSubmit(payload: { triadGroup: TriadGroup; puzzleDate: string }) {
		const { triadGroup, puzzleDate } = payload
		this.dailyScheduleApi.createSchedule(puzzleDate, triadGroup.id).subscribe({
			next: (schedule) => {
				this.snackbar.showSnackbar('Daily puzzle scheduled')
				this.upsertDailySchedule(schedule)
				this.scheduleDraftResetVersion.update((v) => v + 1)
				this.loadDailySchedules()
			},
			error: () => {
				// Error message shown by HTTP interceptor
			},
		})
	}

	onToggleStatus(id: number, active: boolean) {
		this.api.toggleTriadGroupStatus(id, active).subscribe({
			next: (updatedGroup) => {
				this.snackbar.showSnackbar(`Triad group ${active ? 'activated' : 'deactivated'} successfully`)
				// Update only the active property to preserve all existing data and pagination
				this.triadGroups.update((groups) => groups.map((group) => (group.id === id ? { ...group, active: updatedGroup.active } : group)))
				this.loadTriadGroupStats()
			},
			error: () => {
				// Error message shown by HTTP interceptor
			},
		})
	}

	private setupSearchDebounce() {
		this.searchSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$)).subscribe((query) => {
			if (query === this.searchQuery()) {
				return
			}

			this.searchQuery.set(query)
			this.loadTriadGroups(true)
		})
	}

	private upsertDailySchedule(schedule: DailyScheduleRow) {
		this.dailySchedules.update((rows) => [...rows.filter((row) => row.id !== schedule.id && row.triadGroupId !== schedule.triadGroupId), schedule])
	}

	private loadUntilScheduleBoundary(offset: number, accumulated: TriadGroup[]) {
		this.isLoading.set(true)
		this.api.getTriadGroups(offset, this.limit, this.searchQuery(), this.selectedDifficulty()).subscribe({
			next: (response) => {
				const groups = [...accumulated, ...response]
				const hasMore = response.length >= this.limit
				this.triadGroups.set(groups)
				this.hasMore.set(hasMore)
				this.offset = offset + this.limit

				const targetGroupId = this.findScheduleBoundaryTargetId(groups, !hasMore)
				if (targetGroupId !== null) {
					this.finishScheduleBoundaryJump(targetGroupId)
					return
				}

				if (hasMore) {
					this.loadUntilScheduleBoundary(offset + this.limit, groups)
					return
				}

				this.finishScheduleBoundaryJump(null)
			},
			error: () => {
				this.isLoading.set(false)
				this.isJumpingToScheduleBoundary.set(false)
			},
		})
	}

	private findScheduleBoundaryTargetId(groups: TriadGroup[], reachedEnd: boolean): number | null {
		const hintByGroupId = this.scheduleHintByGroupId()
		const firstUnscheduled = groups.find((group) => !hintByGroupId.has(group.id))
		if (firstUnscheduled) {
			return firstUnscheduled.id
		}

		if (reachedEnd && groups.length > 0) {
			return groups[groups.length - 1].id
		}

		return null
	}

	private finishScheduleBoundaryJump(targetGroupId: number | null) {
		this.isLoading.set(false)
		this.isJumpingToScheduleBoundary.set(false)
		this.scrollToTriadGroupAfterRender(targetGroupId)
	}

	private scrollToTriadGroupAfterRender(groupId: number | null): void {
		afterNextRender(
			() => {
				const container = this.scrollContainer()?.nativeElement
				if (!container) {
					return
				}

				if (groupId === null) {
					container.scrollTo({ top: 0, behavior: 'smooth' })
					return
				}

				const target = container.querySelector<HTMLElement>(`[data-triad-group-id="${groupId}"]`)
				if (target) {
					target.scrollIntoView({ behavior: 'smooth', block: 'start' })
					return
				}

				container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
			},
			{ injector: this.injector },
		)
	}

	private addDaysToYmd(value: string, days: number): string {
		const [year, month, day] = value.split('-').map(Number)
		const date = new Date(Date.UTC(year, month - 1, day + days))
		return date.toISOString().slice(0, 10)
	}

	private toApiError(error: unknown): ApiError {
		return isApiError(error) ? error : parseApiError(error)
	}

	protected readonly Boolean = Boolean
}

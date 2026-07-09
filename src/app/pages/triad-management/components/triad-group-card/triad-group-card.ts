import { NgClass } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core'

import { minDailySchedulePuzzleDateYmd } from '../../../../shared/constants/daily-schedule.constant'
import { Difficulty } from '../../../../shared/enums/difficulty.enum'
import { HighlightKeyPipe } from '../../../../shared/pipes/highlight-key.pipe'
import { TriadGroup } from '../../interfaces/triad-group.interface'

/** Assigned Eastern puzzle date scheduled for this triad group (from admin API). */
export interface TriadDailyScheduleHint {
	dateYmd: string
	rowId: number
}

@Component({
	selector: 'app-triad-group-card',
	standalone: true,
	imports: [HighlightKeyPipe, NgClass],
	templateUrl: './triad-group-card.html',
	styleUrl: './triad-group-card.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TriadGroupCard {
	triadGroup = input.required<TriadGroup>()

	editClicked = output<TriadGroup>()

	deleteClicked = output<number>()

	toggleStatusClicked = output<{ id: number; active: boolean }>()

	dailyScheduleSubmit = output<{ triadGroup: TriadGroup; puzzleDate: string }>()

	unscheduleClicked = output<number>()

	/** Assigned scheduled Eastern date for this group, if any. */
	scheduleHint = input<TriadDailyScheduleHint | null>(null)

	/** Bumped by parent after a successful schedule so each card clears its date field. */
	scheduleDraftResetVersion = input(0)

	draftScheduleDate = signal('')

	private readonly defaultMinPuzzleDateYmd = minDailySchedulePuzzleDateYmd()

	private scheduleDraftResetSeen = -1

	constructor() {
		effect(() => {
			const v = this.scheduleDraftResetVersion()
			if (v !== this.scheduleDraftResetSeen) {
				this.scheduleDraftResetSeen = v
				this.draftScheduleDate.set('')
			}
		})
	}

	readonly Difficulty = Difficulty

	getDifficultyBackgroundClass(): string {
		const group = this.triadGroup()
		if (!group.active) {
			return 'bg-neutral-400'
		}

		const difficulty = group.difficulty.toUpperCase()
		switch (difficulty) {
			case Difficulty.EASY:
				return 'bg-green-100'
			case Difficulty.MEDIUM:
				return 'bg-orange-100'
			case Difficulty.HARD:
				return 'bg-red-100'
			default:
				return 'bg-neutral-100'
		}
	}

	getDifficultyText(): string {
		return this.triadGroup().difficulty
	}

	getDifficultyBadgeColor(): string {
		const group = this.triadGroup()
		if (!group.active) {
			return 'bg-gray-500'
		}

		const difficulty = group.difficulty.toUpperCase()
		switch (difficulty) {
			case Difficulty.EASY:
				return 'bg-green-500'
			case Difficulty.MEDIUM:
				return 'bg-orange-500'
			case Difficulty.HARD:
				return 'bg-red-500'
			default:
				return 'bg-gray-500'
		}
	}

	onEdit() {
		this.editClicked.emit(this.triadGroup())
	}

	onDelete() {
		this.deleteClicked.emit(this.triadGroup().id)
	}

	onToggleStatus() {
		const currentStatus = this.triadGroup().active
		this.toggleStatusClicked.emit({ id: this.triadGroup().id, active: !currentStatus })
	}

	onDraftScheduleDateInput(event: Event) {
		this.draftScheduleDate.set((event.target as HTMLInputElement).value)
	}

	onDailyScheduleSubmit() {
		const puzzleDate = this.displayScheduleDateForInput().trim()
		if (!puzzleDate) {
			return
		}
		this.dailyScheduleSubmit.emit({ triadGroup: this.triadGroup(), puzzleDate })
	}

	displayScheduleDateForInput(): string {
		return this.draftScheduleDate() || this.scheduleHint()?.dateYmd || ''
	}

	/** Allows past scheduled dates to remain visible in the picker while new picks stay ≥ Eastern today. */
	effectiveDateInputMin(): string {
		const hint = this.scheduleHint()?.dateYmd
		if (!hint) {
			return this.defaultMinPuzzleDateYmd
		}
		return hint.localeCompare(this.defaultMinPuzzleDateYmd) < 0 ? hint : this.defaultMinPuzzleDateYmd
	}

	onUnscheduleClick() {
		const rowId = this.scheduleHint()?.rowId
		if (rowId === undefined) {
			return
		}
		this.unscheduleClicked.emit(rowId)
	}
}

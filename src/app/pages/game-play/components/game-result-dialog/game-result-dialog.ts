import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core'
import { IonModal } from '@ionic/angular/standalone'

import { CLASSIC_CAPACITY_MESSAGE, CLASSIC_FINAL_CAPTION } from '../../../../shared/constants/global.constant'
import { isApiError, parseApiError } from '../../../../shared/errors/api-error.util'
import { AssetPreloadService } from '../../../../shared/services/asset-preload.service'
import { DailyPostPlayService } from '../../../../shared/services/daily-post-play.service'
import { formatClassicRemainingLabel } from '../../../../shared/utils/classic-extra.util'
import { GlobalStore } from '../../../../state/global.store'
import { getScoreGifPath } from '../../constants/share.constant'
import { DailyReviewSummary } from '../../interfaces/daily-review.interface'
import { DailyReviewDialog } from '../daily-review-dialog/daily-review-dialog'
import { PlayMoreDialog } from '../play-more-dialog/play-more-dialog'
import { SolutionReveal } from '../solution-reveal/solution-reveal'

const CELEBRATION_SOUND_PATH = 'sounds/ta-dah.mp3'

@Component({
	selector: 'app-game-result-dialog',
	imports: [DailyReviewDialog, IonModal, PlayMoreDialog, SolutionReveal],
	templateUrl: './game-result-dialog.html',
	styleUrl: './game-result-dialog.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameResultDialog {
	result = input.required<'WON' | 'LOST'>()

	restartRequested = output<void>()

	readonly store = inject(GlobalStore)

	showPlayAgainButton = signal(false)

	showResultActions = signal(false)

	readonly isDailyMode = computed(() => this.store.gameMode() === 'daily')

	readonly isStandaloneClassicMode = computed(() => this.store.gameMode() === 'standalone-classic')

	readonly isFinalClassicExtra = computed(() => this.store.gameMode() === 'classic' && this.store.isFinalClassicExtraSession())

	readonly classicCapacityMessage = CLASSIC_CAPACITY_MESSAGE

	readonly classicFinalCaption = CLASSIC_FINAL_CAPTION

	readonly classicExtrasRemaining = computed(() => this.store.classicExtraQuota()?.classicExtrasRemaining ?? 0)

	readonly canPlayMore = computed(() => this.classicExtrasRemaining() > 0)

	readonly canContinueClassic = computed(() => this.isStandaloneClassicMode() || (this.classicExtrasRemaining() > 0 && !this.isFinalClassicExtra()))

	readonly classicPlayAgainLabel = computed(() => {
		const remaining = this.classicExtrasRemaining()
		if (remaining > 1) {
			return `Play Again${formatClassicRemainingLabel(remaining)}`
		}
		return 'Play Again'
	})

	countdownLabel = signal('')

	nextDailyPuzzleAvailable = signal(false)

	readonly reviewDialogOpen = signal(false)

	readonly playMoreDialogOpen = signal(false)

	readonly reviewLoading = signal(false)

	readonly reviewError = signal<string | null>(null)

	private celebrationPlayed = false

	private readonly assetPreloadService = inject(AssetPreloadService)

	readonly scoreGifPath = computed(() => {
		this.assetPreloadService.imageVersion()
		return this.assetPreloadService.getImageUrl(getScoreGifPath(this.store.gameScore()))
	})

	private readonly dailyPostPlayService = inject(DailyPostPlayService)

	readonly reviewSummary = computed<DailyReviewSummary | null>(() => {
		const result = this.result()
		const score = this.store.gameScore()
		const nextPuzzleAt = this.isDailyMode() ? this.store.dailyNextPuzzleAt() : null
		const puzzleDate = this.isDailyMode() ? this.store.dailyPuzzleDate() : null

		const dailyReviewTriads = this.store.dailyReviewTriads()
		const currentGameTriads = this.dailyPostPlayService.mergeReviewTriads(this.store.solvedTriads(), this.store.unsolvedTriads())

		if (this.isDailyMode()) {
			if (this.dailyPostPlayService.hasCompleteReviewTriads(dailyReviewTriads)) {
				return this.dailyPostPlayService.createReviewSummary({
					result,
					score,
					puzzleDate,
					nextPuzzleAt,
					triads: dailyReviewTriads,
				})
			}
			if (this.dailyPostPlayService.hasCompleteReviewTriads(currentGameTriads)) {
				return this.dailyPostPlayService.createReviewSummary({
					result,
					score,
					puzzleDate,
					nextPuzzleAt,
					triads: currentGameTriads,
				})
			}
			return null
		}

		if (this.dailyPostPlayService.hasCompleteReviewTriads(currentGameTriads)) {
			return this.dailyPostPlayService.createReviewSummary({
				result,
				score,
				puzzleDate,
				nextPuzzleAt: null,
				triads: currentGameTriads,
			})
		}

		if (this.dailyPostPlayService.hasCompleteReviewTriads(dailyReviewTriads)) {
			return this.dailyPostPlayService.createReviewSummary({
				result,
				score,
				puzzleDate,
				nextPuzzleAt: null,
				triads: dailyReviewTriads,
			})
		}

		return null
	})

	constructor() {
		effect((onCleanup) => {
			const isDaily = this.store.gameMode() === 'daily'
			const target = this.store.dailyNextPuzzleAt()
			if (!isDaily || !target) {
				this.nextDailyPuzzleAvailable.set(false)
				this.countdownLabel.set('')
				return
			}
			const tick = () => {
				const diff = new Date(target).getTime() - Date.now()
				if (diff <= 0) {
					this.nextDailyPuzzleAvailable.set(true)
					this.countdownLabel.set('The next puzzle is available now.')
					return
				}
				this.nextDailyPuzzleAvailable.set(false)
				const h = Math.floor(diff / 3600000)
				const m = Math.floor((diff % 3600000) / 60000)
				const s = Math.floor((diff % 60000) / 1000)
				this.countdownLabel.set(`${h}h ${m}m ${s}s until the next daily puzzle (Eastern)`)
			}
			tick()
			const id = window.setInterval(tick, 1000)
			onCleanup(() => clearInterval(id))
		})

		// Watch for game state and unsolved triads to show button
		effect(() => {
			const result = this.result()
			const unsolvedTriads = this.store.unsolvedTriads()
			const gameScore = this.store.gameScore()

			if (this.store.gameMode() === 'daily') {
				this.showResultActions.set(true)
				this.showPlayAgainButton.set(true)
				if (result === 'WON' && gameScore === 15 && !this.celebrationPlayed) {
					this.celebrationPlayed = true
					this.assetPreloadService.playSound(CELEBRATION_SOUND_PATH, { volume: 0.7 })
				}
				return
			}

			const canPlayAgain = this.canContinueClassic()

			if (result === 'LOST') {
				// For LOST state, show actions after solutions appear (or after max 2 seconds)
				if (unsolvedTriads && unsolvedTriads.length > 0) {
					setTimeout(() => {
						this.showResultActions.set(true)
						this.showPlayAgainButton.set(canPlayAgain)
					}, 500)
				} else {
					setTimeout(() => {
						this.showResultActions.set(true)
						this.showPlayAgainButton.set(canPlayAgain)
					}, 2000)
				}
			} else if (result === 'WON') {
				this.showResultActions.set(true)
				this.showPlayAgainButton.set(canPlayAgain)

				if (gameScore === 15 && !this.celebrationPlayed) {
					this.celebrationPlayed = true
					this.assetPreloadService.playSound(CELEBRATION_SOUND_PATH, { volume: 0.7 })
				}
			}
		})
	}

	playNow() {
		this.restartGame()
	}

	restartGame() {
		this.store.setUnsolvedTriads(null)
		this.store.resetGameState()
		this.showPlayAgainButton.set(false)
		this.showResultActions.set(false)
		this.restartRequested.emit()
	}

	openPlayMoreDialog() {
		if (!this.canPlayMore()) {
			return
		}

		this.playMoreDialogOpen.set(true)
	}

	closePlayMoreDialog() {
		this.playMoreDialogOpen.set(false)
	}

	async shareGameResult() {
		await this.dailyPostPlayService.shareScoreImage(this.store.gameScore(), this.store.dailyPuzzleDate())
	}

	async openDailyReview() {
		this.reviewError.set(null)
		const summary = this.reviewSummary()
		if (summary) {
			this.reviewDialogOpen.set(true)
			return
		}

		const triadGroupId = this.store.triadGroupId()
		if (!triadGroupId) {
			this.reviewError.set('Unable to load review. Please try again.')
			return
		}

		this.reviewLoading.set(true)
		try {
			const triads = await this.dailyPostPlayService.loadReviewTriads(triadGroupId)
			this.store.setDailyReviewTriads(triads)
			this.reviewDialogOpen.set(true)
		} catch (error) {
			const apiError = isApiError(error) ? error : parseApiError(error)
			apiError.markHandled()
			this.reviewError.set(apiError.userMessage)
		} finally {
			this.reviewLoading.set(false)
		}
	}

	closeDailyReview() {
		this.reviewDialogOpen.set(false)
	}
}

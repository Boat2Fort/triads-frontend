import { inject, Injectable } from '@angular/core'
import { BehaviorSubject, firstValueFrom } from 'rxjs'

import { UserService } from '../../../shared/services/user.service'
import { extractClassicExtraQuota } from '../../../shared/utils/classic-extra.util'
import { GlobalStore } from '../../../state/global.store'
import { GamePlayState } from '../enums/game-play.enum'
import { SolvedTriad } from '../interfaces/triad.interface'
import { GamePlayApi } from './game-play-api'
import { TurnHintService } from './turn-hint.service'

@Injectable({
	providedIn: 'root',
})
export class GamePlayLogic {
	private readonly store = inject(GlobalStore)

	private readonly userService = inject(UserService)

	private readonly turnHintService = inject(TurnHintService)

	private readonly gamePlayApi = inject(GamePlayApi)

	answerFieldFocus$ = new BehaviorSubject<boolean>(false)

	answerFieldValue$ = new BehaviorSubject<string | null>(null)

	resetAnswerFieldState() {
		this.answerFieldFocus$.next(false)
		this.answerFieldValue$.next(null)
	}

	handleGameWon() {
		// Score updates
		const score = this.calculateScore()

		if (this.store.gameMode() === 'daily') {
			this.gamePlayApi.postDailyComplete('won', score).subscribe({
				next: (res) => {
					this.store.setDailyNextPuzzleAt(res.nextPuzzleAt)
					this.gamePlayApi.getDailyTodayInfo().subscribe({
						next: (info) => {
							const quota = extractClassicExtraQuota(info)
							if (quota) {
								this.store.setClassicExtraQuota(quota)
							}
						},
					})
				},
				error: () => {
					/* non-blocking */
				},
			})
		}

		// User state updates
		this.store.setGameScore(score)
		this.store.setGamePlayState(GamePlayState.WON)
		this.persistDailyGameResult(score)
	}

	async handleGameLost() {
		// Score updates
		const score = this.calculateScore()

		if (this.store.gameMode() === 'daily') {
			this.gamePlayApi.postDailyComplete('lost', score).subscribe({
				next: (res) => {
					this.store.setDailyNextPuzzleAt(res.nextPuzzleAt)
					this.gamePlayApi.getDailyTodayInfo().subscribe({
						next: (info) => {
							const quota = extractClassicExtraQuota(info)
							if (quota) {
								this.store.setClassicExtraQuota(quota)
							}
						},
					})
				},
				error: () => {
					/* non-blocking */
				},
			})
		}

		// User state updates
		this.store.setGameScore(score)
		this.store.setGamePlayState(GamePlayState.LOST)
		this.persistDailyGameResult(score)

		// Fetch and display solutions for unsolved triads
		await this.fetchAndSetUnsolvedTriads()
	}

	private async fetchAndSetUnsolvedTriads() {
		const triadGroupId = this.store.triadGroupId()
		if (!triadGroupId) {
			return
		}

		try {
			const allTriads = await firstValueFrom(this.gamePlayApi.getTriadGroupSolutions(triadGroupId))
			const triadsStep = this.store.triadsStep()
			const solvedTriads = this.store.solvedTriads()
			const finalTriadCues = this.store.finalTriadCues()

			let unsolvedTriads: SolvedTriad[] = []

			if (triadsStep === 'INITIAL') {
				// Failed during initial 3 triads - show solutions for all 3 initial triads (excluding bonus)
				// Filter to get only first 3 triads (triads 1-3), exclude the 4th/bonus triad
				const initialTriads = allTriads.slice(0, 3)
				// Filter out already solved triads
				const solvedTriadIds = solvedTriads.map((triad) => triad.id)
				unsolvedTriads = initialTriads.filter((triad) => !solvedTriadIds.includes(triad.id))
			} else if (triadsStep === 'FINAL' && finalTriadCues && finalTriadCues.length === 3) {
				// Failed during bonus round - show only the bonus triad solution (4th triad)
				// The 4th triad should be at index 3 (0-indexed)
				if (allTriads.length > 3) {
					const bonusTriad = allTriads[3]
					if (bonusTriad) {
						unsolvedTriads = [bonusTriad]
					}
				} else {
					const fourthTriad = await firstValueFrom(this.gamePlayApi.fetchFourthTriadSolution(triadGroupId))
					if (fourthTriad) {
						unsolvedTriads = [fourthTriad]
					}
				}
			}

			this.store.setUnsolvedTriads(unsolvedTriads.length > 0 ? unsolvedTriads : null)
		} catch (error) {
			// Silently fail - don't show solutions if API call fails
			console.error('Failed to fetch unsolved triads:', error)
			this.store.setUnsolvedTriads(null)
		}
	}

	private persistDailyGameResult(score: number): void {
		if (this.store.gameMode() !== 'daily' && this.store.gameMode() !== 'standalone-classic') {
			return
		}

		const user = this.store.user()
		if (!user?.scores) {
			return
		}

		const newScores = { ...user.scores, [score]: (user.scores[score] ?? 0) + 1 }
		const newUser = {
			...user,
			scores: newScores,
			firstGameDate: user.firstGameDate ?? new Date().toISOString(),
		}
		this.store.setUser(newUser)
		this.userService.setUser(newUser)
	}

	calculateScore() {
		const availableTurns = this.turnHintService.numberOfAvailableTurns(this.store.turns())
		const availableHints = this.turnHintService.numberOfAvailableHints(this.store.hints())
		const availableCues = this.store.cues()
		const finalTriadCues = this.store.finalTriadCues()

		// A perfect score! Got all 4 Triads with no misses, no hints => 15
		if (availableTurns === 3 && availableHints === 2) {
			return 15
		}
		// Success (all 4 solved) but with either 1 miss or 1 hint => 12
		else if ((availableTurns === 2 && availableHints === 2) || (availableTurns === 2 && availableHints === 1)) {
			return 12
		}
		// Success (all 4), but with 2 misses and/or hints => 10
		else if (
			(availableTurns === 1 && availableHints === 2) ||
			(availableTurns === 1 && availableHints === 1) ||
			(availableTurns === 1 && availableHints === 0)
		) {
			return 10
		}
		// Got 3 Triads, but just couldn’t solve the bonus => 8
		else if (availableTurns === 0 && availableCues && availableCues.length === 0 && finalTriadCues && finalTriadCues.length === 3) {
			return 8
		}
		// Got 2 Triad but couldn’t get the other 3rd, no bonus round => 6
		else if (availableTurns === 0 && availableCues && availableCues.length === 3) {
			return 6
		}
		// Got 1 Triad before using up turns => 3
		else if (availableTurns === 0 && availableCues && availableCues.length === 6) {
			return 3
		}

		return 0
	}
}

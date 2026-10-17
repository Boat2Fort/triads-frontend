import { Component, computed, inject, OnDestroy, signal } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { ActionSheetController } from '@ionic/angular/standalone'
import { Subscription, tap, timer } from 'rxjs'

import { isApiError, parseApiError } from '../../../../shared/errors/api-error.util'
import { AssetPreloadService } from '../../../../shared/services/asset-preload.service'
import { GlobalStore } from '../../../../state/global.store'
import { GamePlayState } from '../../enums/game-play.enum'
import { GamePlayApi } from '../../services/game-play-api'
import { GamePlayLogic } from '../../services/game-play-logic'
import { TurnHintService } from '../../services/turn-hint.service'

const LIFESAVER_IMAGE_PATH = 'images/lifesaver.svg'

@Component({
	selector: 'app-hints-box',
	imports: [ReactiveFormsModule],
	templateUrl: './hints-box.html',
	styleUrls: ['./hints-box.scss'],
})
export class HintsBox implements OnDestroy {
	readonly store = inject(GlobalStore)

	serverError = signal<string | null>(null)

	private readonly turnHintService = inject(TurnHintService)

	private readonly assetPreloadService = inject(AssetPreloadService)

	private readonly gamePlayApi = inject(GamePlayApi)

	private readonly gamePlayLogic = inject(GamePlayLogic)

	private readonly actionSheetController = inject(ActionSheetController)

	private activeActionSheet: HTMLIonActionSheetElement | null = null

	private destroyed = false

	private openingActionSheet = false

	private readonly subscriptions$ = new Subscription()

	readonly lifesaverIconUrl = computed(() => {
		this.assetPreloadService.imageVersion()
		return this.assetPreloadService.getImageUrl(LIFESAVER_IMAGE_PATH)
	})

	ngOnDestroy() {
		this.destroyed = true
		this.subscriptions$.unsubscribe()
		this.activeActionSheet?.dismiss()
	}

	areHintsDisabledDueToTurns(): boolean {
		return (
			![GamePlayState.PLAYING, GamePlayState.CHECK_SOLUTION, GamePlayState.ACCEPT_ANSWER].includes(this.store.gamePlayState()) ||
			this.store.isCheckingTriad() ||
			this.store.isCheckingAnswer() ||
			this.store.isFetchingHint() ||
			this.store.isFetchingFinalTriadCues() ||
			!this.turnHintService.canUseHint(this.store.turns(), this.store.hints())
		)
	}

	onHintClick() {
		if (this.areHintsDisabledDueToTurns() || this.activeActionSheet || this.openingActionSheet) {
			return
		}
		this.serverError.set(null)

		const availableHints = this.turnHintService.numberOfAvailableHints(this.store.hints())
		const selectedCues = this.store.selectedCues()
		const cues = this.store.cues()
		const availableCues = cues && cues.length > 0 ? this.store.cues() : this.store.finalTriadCues()

		const shouldShowChoice = availableHints === 1 || selectedCues.length === 3 || availableCues?.length === 3

		if (!availableCues || availableCues.length === 0) {
			return
		}

		if (selectedCues.length === 3) {
			this.store.setIsFetchingHint(true)
			this.subscriptions$.add(
				this.gamePlayApi.checkTriad(selectedCues).subscribe({
					next: (validTriad) => {
						this.store.setIsFetchingHint(false)
						if (!validTriad) {
							this.store.setHintUsage(true)
							if (this.turnHintService.numberOfAvailableTurns(this.store.turns()) === 1) {
								this.store.setHintUsedWithOneTurnRemaining(true)
							}
							this.applyHintFailureForNonTriadSelection()
							return
						}
						if (shouldShowChoice) {
							this.showHintChoiceSheet()
						} else {
							this.useHint()
						}
					},
					error: (error) => {
						this.store.setIsFetchingHint(false)
						this.handleApiError(error)
					},
				}),
			)
			return
		}

		if (shouldShowChoice) {
			this.showHintChoiceSheet()
		} else {
			this.useHint()
		}
	}

	private async showHintChoiceSheet() {
		if (this.destroyed || this.activeActionSheet || this.openingActionSheet) return
		this.openingActionSheet = true
		try {
			const usedTypes = this.store.usedHintTypes()
			const keywordLengthUsed = usedTypes.includes('KEYWORD_LENGTH')
			const firstLetterUsed = usedTypes.includes('FIRST_LETTER')

			const sheet = await this.actionSheetController.create({
				header: 'Choose your hint',
				subHeader: 'Pick one of the options below to help solve the Triad.',
				buttons: [
					{
						text: keywordLengthUsed ? 'Number of letters (Already used)' : 'Number of letters',
						handler: () => {
							if (!keywordLengthUsed) {
								this.useHint('KEYWORD_LENGTH')
							}
							return !keywordLengthUsed
						},
						cssClass: keywordLengthUsed ? 'action-sheet-disabled' : '',
					},
					{
						text: firstLetterUsed ? '1st letter of word (Already used)' : '1st letter of word',
						handler: () => {
							if (!firstLetterUsed) {
								this.useHint('FIRST_LETTER')
							}
							return !firstLetterUsed
						},
						cssClass: firstLetterUsed ? 'action-sheet-disabled' : '',
					},
					{
						text: 'Cancel',
						role: 'cancel',
					},
				],
			})
			if (this.destroyed) {
				void sheet.dismiss()
				return
			}
			this.activeActionSheet = sheet
			await sheet.present()
			void sheet.onDidDismiss().then(() => {
				if (this.activeActionSheet === sheet) this.activeActionSheet = null
			})
		} catch (error) {
			if (!this.destroyed) this.handleApiError(error)
		} finally {
			this.openingActionSheet = false
		}
	}

	private dismissActionSheet() {
		this.activeActionSheet?.dismiss()
		this.activeActionSheet = null
	}

	useHint(hintExtra?: 'KEYWORD_LENGTH' | 'FIRST_LETTER') {
		// Prevent hint usage if hints are disabled due to turns being used up
		if (this.areHintsDisabledDueToTurns()) {
			return
		}

		// Check if user has 3 cues selected - if so, use those for the hint
		const selectedCues = this.store.selectedCues()
		const hadThreeSelected = selectedCues.length === 3

		// Determine which cues to use for the hint request
		let availableCues: string[] | null = null
		if (hadThreeSelected) {
			// User has 3 cues selected, use those for the hint
			availableCues = selectedCues
		} else {
			// Fall back to current behavior: use all cues or final triad cues
			const cues = this.store.cues()
			availableCues = cues && cues.length > 0 ? this.store.cues() : this.store.finalTriadCues()
		}

		if (availableCues?.length) {
			this.serverError.set(null)
			try {
				this.store.setIsFetchingHint(true)
				this.subscriptions$.add(
					this.turnHintService.getHint(availableCues, hintExtra).subscribe({
						next: (triadsForHint) => {
							const hints = this.store.hints()
							const hasHintCues = triadsForHint?.hint?.length === 3

							if (hadThreeSelected && !hasHintCues) {
								this.store.setHintUsage(true)
								this.store.setHintUsedWithOneTurnRemaining(this.turnHintService.numberOfAvailableTurns(this.store.turns()) === 1)
								this.dismissActionSheet()
								this.applyHintFailureForNonTriadSelection()
								this.store.setIsFetchingHint(false)
								return
							}

							if (triadsForHint?.hint && hasHintCues) {
								const updatedHints = this.turnHintService.useHintToken(hints)
								const hintCues = triadsForHint.hint
								// Selection restoration clears hints, so select before applying the new hint.
								if (!hadThreeSelected) this.store.setSelectedCues(hintCues)
								// When the player uses a hint with an extra value, show a special hint
								if (triadsForHint.with === 'KEYWORD_LENGTH') {
									// Set keyword length hint, but preserve first letter if it exists
									this.store.setKeywordLengthHint(triadsForHint.withValue ? Number(triadsForHint.withValue) : null)
									// Track that this hint type is now active
									this.store.setActiveHintType('KEYWORD_LENGTH')
									// Track that this hint type has been used (so it stays disabled after wrong guesses)
									this.store.addUsedHintType('KEYWORD_LENGTH')
									// If first letter hint already exists, keep it for combination
									// The first letter will be filled in InputSet when it's displayed
									// Clear answerFieldValue$ since we're switching to InputSet
									if (this.store.firstLetterHint()) {
										this.gamePlayLogic.answerFieldValue$.next(null)
									}
								} else if (triadsForHint.with === 'FIRST_LETTER' && triadsForHint.withValue) {
									// Store the first letter hint
									this.store.setFirstLetterHint(triadsForHint.withValue)
									// Track that this hint type is now active
									this.store.setActiveHintType('FIRST_LETTER')
									// Track that this hint type has been used (so it stays disabled after wrong guesses)
									this.store.addUsedHintType('FIRST_LETTER')

									// If keyword length hint already exists, we'll fill the first box in InputSet
									// Otherwise, set it for the regular input field
									if (this.store.keywordLengthHint() === null) {
										// Ensure the answer field is enabled before focusing it
										this.store.setIsCheckingTriad(false)
										this.store.setIsCheckingAnswer(false)

										this.gamePlayLogic.answerFieldValue$.next(triadsForHint.withValue)
										// Set the flag to focus the answer field when it appears
										this.gamePlayLogic.answerFieldFocus$.next(true)
									}
								}

								// Close the extra hint modal
								this.dismissActionSheet()

								this.store.setHints(updatedHints)

								// Skip the "Check Solution" step
								this.store.setHintUsage(true)
								this.store.setHintUsedWithOneTurnRemaining(this.turnHintService.numberOfAvailableTurns(this.store.turns()) === 1)
								const result = this.turnHintService.applyHintOutcome(this.store.turns(), updatedHints, 'CORRECT')
								this.store.setTurns(result.turns)
								this.store.setGamePlayState(GamePlayState.ACCEPT_ANSWER)
								this.gamePlayLogic.answerFieldFocus$.next(true)
							}
							this.store.setIsFetchingHint(false)
						},
						error: (error) => {
							this.store.setIsFetchingHint(false)
							this.handleApiError(error)
						},
					}),
				)
			} catch (error) {
				this.store.setIsFetchingHint(false)
				this.handleApiError(error)
			}
		}
	}

	/**
	 * Hint was used (flags already set) but the three cues are not a valid triad.
	 * Consumes a hint, applies hint+fail turn rules, shows WRONG_TRIAD, then resets after delay.
	 */
	private applyHintFailureForNonTriadSelection() {
		this.dismissActionSheet()

		const hints = this.store.hints()
		const updatedHints = this.turnHintService.useHintToken(hints)
		const { turns, hints: hintsAfterOutcome, gameEnds } = this.turnHintService.applyHintOutcome(this.store.turns(), updatedHints, 'FAIL')
		this.store.setTurns(turns)
		this.store.setHints(hintsAfterOutcome)

		if (gameEnds) {
			this.gamePlayLogic.handleGameLost()
		} else {
			this.store.setGamePlayState(GamePlayState.WRONG_TRIAD)
		}

		this.subscriptions$.add(
			timer(2000)
				.pipe(
					tap(() => {
						if (
							this.store.gamePlayState() !== GamePlayState.WON &&
							this.store.gamePlayState() !== GamePlayState.LOST &&
							this.turnHintService.numberOfAvailableTurns(this.store.turns()) > 0
						) {
							this.store.setGamePlayState(GamePlayState.PLAYING)
							this.store.setSelectedCues([])
							this.store.setHintUsage(false)
							this.store.setHintUsedWithOneTurnRemaining(false)
						} else if (this.turnHintService.numberOfAvailableTurns(this.store.turns()) === 0) {
							this.gamePlayLogic.handleGameLost()
						}
					}),
				)
				.subscribe(),
		)
	}

	// All turn and hint transitions are now handled by TurnHintService

	private handleApiError(error: unknown): void {
		const apiError = isApiError(error) ? error : parseApiError(error)
		apiError.markHandled()
		this.serverError.set(apiError.userMessage)
	}
}

import { AfterViewChecked, ChangeDetectorRef, Component, effect, ElementRef, inject, OnDestroy, OnInit, output, signal, viewChild } from '@angular/core'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { delay, filter, firstValueFrom, Subject, Subscription, takeUntil, tap } from 'rxjs'

import { AutoCapitalize } from '../../../../shared/directives/auto-capitalize'
import { ReverseErase } from '../../../../shared/directives/reverse-erase'
import { isApiError, parseApiError } from '../../../../shared/errors/api-error.util'
import { GlobalStore } from '../../../../state/global.store'
import { GamePlayState } from '../../enums/game-play.enum'
import { SolvedTriad } from '../../interfaces/triad.interface'
import { GamePlayApi } from '../../services/game-play-api'
import { GamePlayLogic } from '../../services/game-play-logic'
import { TurnHintService } from '../../services/turn-hint.service'
import { InputSet } from '../input-set/input-set'

const REVERSE_ERASE_START_DELAY_MS = 250

@Component({
	selector: 'app-solution-section',
	imports: [InputSet, ReactiveFormsModule, AutoCapitalize, ReverseErase],
	templateUrl: './solution-section.html',
	styleUrl: './solution-section.scss',
})
export class SolutionSection implements OnInit, AfterViewChecked, OnDestroy {
	whenMovingCueToSolutionBox = output<SolvedTriad>()

	readonly store = inject(GlobalStore)

	answerFormControl = new FormControl<string>('', { validators: [Validators.required] })

	serverError = signal<string | null>(null)

	// Flag to track if we need to focus the answer field or not
	shouldFocusAnswerField = false

	/** Whether the plain-input reverse-erase animation is currently running. */
	isErasing = false

	/** Characters rendered in the ghost overlay during the reverse-erase animation. */
	eraseOverlayChars: string[] = []

	/** When true, the reverse-erase animation on the plain input will keep the first character. */
	preserveFirstLetterOnErase = false

	protected readonly GamePlayState = GamePlayState

	private readonly subscriptions$ = new Subscription()

	private destroyed = false

	private requestGeneration = 0

	private readonly requestsCancelled$ = new Subject<void>()

	private timeoutIds: ReturnType<typeof setTimeout>[] = []

	private readonly gamePlayApi = inject(GamePlayApi)

	private readonly gamePlayLogic = inject(GamePlayLogic)

	private readonly turnHintService = inject(TurnHintService)

	private readonly cdr = inject(ChangeDetectorRef)

	private readonly answerFieldRef = viewChild<ElementRef<HTMLInputElement>>('answerField')

	private readonly letterInputsRef = viewChild<InputSet>('letterInputs')

	private readonly eraseOverlayRef = viewChild<ElementRef<HTMLElement>>('eraseOverlay')

	private readonly plainReverseEraser = viewChild(ReverseErase)

	private readonly bubblePopAudio = new Audio()

	constructor() {
		this.bubblePopAudio.src = 'sounds/three-pops.mp3'

		effect(() => {
			const gameState = this.store.gamePlayState()
			if (gameState === GamePlayState.ACCEPT_ANSWER || gameState === GamePlayState.WRONG_ANSWER) {
				this.shouldFocusAnswerField = true
			} else if (gameState === GamePlayState.PLAYING || gameState === GamePlayState.CHECK_SOLUTION) {
				if (document.activeElement instanceof HTMLElement) {
					document.activeElement.blur()
				}
			}
		})

		// Watch loading signals and disable/enable answerFormControl
		effect(() => {
			const isCheckingAnswer = this.store.isCheckingAnswer()
			const isCheckingTriad = this.store.isCheckingTriad()
			const isLoading = isCheckingAnswer || isCheckingTriad

			if (isLoading) {
				this.answerFormControl.disable()
			} else {
				this.answerFormControl.enable()
			}
		})

		// Clear stale answer/hint field state when fewer than three bubbles are selected (field is hidden in PLAYING).
		effect(() => {
			const len = this.store.selectedCues().length
			if (len >= 3) {
				return
			}
			this.answerFormControl.reset('', { emitEvent: false })
			this.gamePlayLogic.resetAnswerFieldState()
		})

		// Re-apply first-letter-only hint to the plain input after the same triad is re-selected (snapshot restore).
		effect(() => {
			const gameState = this.store.gamePlayState()
			const cues = this.store.selectedCues()
			const keywordLen = this.store.keywordLengthHint()
			const firstLetter = this.store.firstLetterHint()
			if (gameState !== GamePlayState.ACCEPT_ANSWER || cues.length !== 3) {
				return
			}
			if (keywordLen !== null || !firstLetter) {
				return
			}
			const current = this.answerFormControl.value ?? ''
			if (current !== firstLetter) {
				this.answerFormControl.setValue(firstLetter, { emitEvent: false })
			}
		})
	}

	ngOnInit() {
		this.subscribeToAnswerFieldChanges()
		if (this.store.triadsStep() === 'FINAL' && !this.store.finalTriadCues()?.length) void this.loadFinalTriadCues()
	}

	ngOnDestroy() {
		this.destroyed = true
		this.requestsCancelled$.next()
		this.requestsCancelled$.complete()
		this.subscriptions$.unsubscribe()
		// CRITICAL: Clear all pending timeouts
		this.timeoutIds.forEach((id) => clearTimeout(id))
		this.timeoutIds = []
	}

	resetComponentState() {
		this.requestGeneration++
		this.requestsCancelled$.next()
		this.serverError.set(null)
		// Reset form control
		this.answerFormControl.reset()
		// Reset focus flag
		this.shouldFocusAnswerField = false
		this.isErasing = false
		this.eraseOverlayChars = []
		this.preserveFirstLetterOnErase = false
		// Clear all pending timeouts
		this.timeoutIds.forEach((id) => clearTimeout(id))
		this.timeoutIds = []
	}

	ngAfterViewChecked() {
		if (!this.shouldFocusAnswerField) {
			return
		}
		const useLetterInputs = this.store.keywordLengthHint() !== null
		if (useLetterInputs) {
			const letterInputs = this.letterInputsRef()
			if (letterInputs) {
				const timeoutId = setTimeout(() => {
					letterInputs.focusForRetry()
					this.shouldFocusAnswerField = false
				}, 0)
				this.timeoutIds.push(timeoutId)
			}
			return
		}
		const answerField = this.answerFieldRef()?.nativeElement
		if (answerField) {
			const timeoutId = setTimeout(() => {
				answerField.focus()
				if (this.isMobileDevice()) {
					answerField.click()
				}
				this.shouldFocusAnswerField = false
			}, 0)
			this.timeoutIds.push(timeoutId)
		}
	}

	private isBusy(): boolean {
		return this.store.isCheckingTriad() || this.store.isCheckingAnswer() || this.store.isFetchingHint() || this.store.isFetchingFinalTriadCues()
	}

	checkTriad() {
		if (this.isBusy() || this.store.gamePlayState() !== GamePlayState.CHECK_SOLUTION) return
		this.serverError.set(null)
		const selectedCues = this.store.selectedCues()

		if (selectedCues.length === 3) {
			this.store.setIsCheckingTriad(true)
			this.subscriptions$.add(
				this.gamePlayApi
					.checkTriad(selectedCues)
					.pipe(
						tap((success) => {
							this.store.setIsCheckingTriad(false)
							if (success) {
								this.store.setGamePlayState(GamePlayState.ACCEPT_ANSWER)
								this.shouldFocusAnswerField = true
								// Trigger keyboard on mobile devices after state change
								if (this.isMobileDevice()) {
									// Use a small delay to ensure the input field is rendered
									const timeoutId = setTimeout(() => {
										const answerField = this.answerFieldRef()?.nativeElement
										if (answerField) {
											answerField.focus()
											// On some mobile browsers, we need to click to trigger keyboard
											answerField.click()
										}
									}, 100)
									this.timeoutIds.push(timeoutId)
								}
							} else {
								this.store.setGamePlayState(GamePlayState.WRONG_TRIAD)
								this.applyOrganicFail()
							}
						}),
						filter((success) => !success),
						delay(2000),
						tap(() => {
							// Only change state back to PLAYING if not in WON or LOST state and turns are not exhausted
							if (
								this.store.gamePlayState() !== GamePlayState.WON &&
								this.store.gamePlayState() !== GamePlayState.LOST &&
								this.turnHintService.numberOfAvailableTurns(this.store.turns()) > 0
							) {
								this.store.setGamePlayState(GamePlayState.PLAYING)
								this.store.setSelectedCues([])
							} else if (this.turnHintService.numberOfAvailableTurns(this.store.turns()) === 0) {
								// If turns are exhausted, ensure game lost state is set
								this.gamePlayLogic.handleGameLost()
							}
						}),
						takeUntil(this.requestsCancelled$),
					)
					.subscribe({
						error: (error) => {
							this.store.setIsCheckingTriad(false)
							this.handleApiError(error)
						},
					}),
			)
		}
	}

	submitAnswer(answer: string | null) {
		if (this.isBusy() || this.isErasing || this.store.gamePlayState() !== GamePlayState.ACCEPT_ANSWER) return
		this.serverError.set(null)
		const trimmedAnswer = answer?.trim() ?? ''
		const selectedCues = this.store.selectedCues()
		if (trimmedAnswer.length > 0 && selectedCues && selectedCues.length === 3) {
			this.store.setIsCheckingAnswer(true)
			this.subscriptions$.add(
				this.gamePlayApi
					.checkAnswer(selectedCues, trimmedAnswer)
					.pipe(takeUntil(this.requestsCancelled$))
					.subscribe({
						next: (response) => {
							this.handleAnswerResponse(response)
							this.store.setIsCheckingAnswer(false)
						},
						error: (error) => {
							this.store.setIsCheckingAnswer(false)
							this.handleApiError(error)
						},
					}),
			)
		}
	}

	/**
	 * Detects if the current device is a mobile device
	 */
	private isMobileDevice(): boolean {
		return (
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768 && 'ontouchstart' in window)
		)
	}

	/**
	 * Suppress keystrokes on the plain input while the reverse-erase animation is running.
	 * The input stays visually enabled so focus is preserved, but typing is a no-op until the
	 * animation completes.
	 */
	onAnswerKeydown(event: KeyboardEvent): void {
		if (this.isErasing) {
			event.preventDefault()
		}
	}

	onPlainLetterErased(index: number): void {
		const value = this.answerFormControl.value ?? ''
		if (index < 0 || index >= value.length) {
			return
		}
		const next = value.slice(0, index) + value.slice(index + 1)
		this.answerFormControl.setValue(next, { emitEvent: false })
	}

	onPlainReverseEraseFinished(): void {
		this.isErasing = false
		this.eraseOverlayChars = []
		const answerField = this.answerFieldRef()?.nativeElement
		if (answerField) {
			answerField.focus()
			if (this.isMobileDevice()) {
				answerField.click()
			}
			const value = this.answerFormControl.value ?? ''
			const caret = value.length
			const apply = () => answerField.setSelectionRange(caret, caret)
			apply()
			requestAnimationFrame(apply)
		}
		this.cdr.markForCheck()
	}

	/**
	 * Schedules the reverse-erase animation to run shortly after a wrong answer is confirmed, so the
	 * player briefly registers the failure before their word is visibly wiped away letter-by-letter.
	 */
	private scheduleWrongAnswerReverseErase(): void {
		const timeoutId = setTimeout(() => {
			if (this.store.gamePlayState() === GamePlayState.LOST || this.store.gamePlayState() === GamePlayState.WON) {
				this.answerFormControl.reset()
				return
			}
			const useLetterInputs = this.store.keywordLengthHint() !== null
			if (useLetterInputs) {
				const letterInputs = this.letterInputsRef()
				if (letterInputs) {
					letterInputs.playReverseErase()
				}
				return
			}
			this.playPlainReverseErase()
		}, REVERSE_ERASE_START_DELAY_MS)
		this.timeoutIds.push(timeoutId)
	}

	private playPlainReverseErase(): void {
		const value = this.answerFormControl.value ?? ''
		if (value.length === 0) {
			return
		}
		this.preserveFirstLetterOnErase = this.store.firstLetterHint() !== null
		this.eraseOverlayChars = Array.from(value)
		this.isErasing = true
		this.cdr.detectChanges()
		const eraser = this.plainReverseEraser()
		const overlay = this.eraseOverlayRef()?.nativeElement
		if (!eraser || !overlay) {
			this.onPlainReverseEraseFinished()
			return
		}
		const targets = Array.from(overlay.querySelectorAll<HTMLElement>('.erase-letter'))
		eraser.play(targets)
	}

	private handleAnswerResponse(response: boolean | SolvedTriad) {
		// This means the answer was correct
		if (response && typeof response !== 'boolean') {
			// Reset deferred turn flag on correct answer (turn was not consumed)
			this.store.setGamePlayState(GamePlayState.CORRECT_ANSWER)
			this.store.setHintUsedWithOneTurnRemaining(false)
			this.store.clearTriadHintSnapshotForCues(response.cues)
			this.bubblePopAudio.playbackRate = 0.7
			this.bubblePopAudio.play()
			this.store.addSolvedTriad(response)

			for (let i = 0; i < response.cues.length; i++) {
				const timeoutId = setTimeout(
					() => {
						this.store.addCueToExplode(response.cues[i])
					},
					100 * (i + 1),
				)
				this.timeoutIds.push(timeoutId)
			}

			const timeoutId = setTimeout(() => {
				this.whenMovingCueToSolutionBox.emit(response)
				this.store.setGamePlayState(GamePlayState.CORRECT_ANSWER)
			}, 1000)
			this.timeoutIds.push(timeoutId)

			this.answerFormControl.reset()
		} else {
			// This means the answer was wrong
			this.store.setGamePlayState(GamePlayState.WRONG_ANSWER)
			// Wrong answer: always apply organic fail (T−1, H unchanged; game ends if T=1)
			const result = this.turnHintService.applyFailure(this.store.turns(), this.store.hints())
			this.store.setTurns(result.turns)
			this.store.setHints(result.hints)

			if (result.gameEnds) {
				this.gamePlayLogic.handleGameLost()
				this.answerFormControl.reset()
			} else {
				this.scheduleWrongAnswerReverseErase()
			}
		}

		const timeoutId = setTimeout(() => {
			// Only change state if not in the WON or LOST state
			if (this.store.gamePlayState() !== GamePlayState.WON && this.store.gamePlayState() !== GamePlayState.LOST) {
				if (response && typeof response != 'boolean') {
					// Reset used hint types only when a triad is solved correctly (not on wrong guesses)
					this.store.resetUsedHintTypes()
					this.store.setSelectedCues([])
					this.store.removeSolvedCues(response.cues) // Remove the solved cues from the list of cues shown to the player
					this.store.setGamePlayState(GamePlayState.PLAYING)

					// Auto-select remaining cues if exactly 3 remain (after 2 triads solved)
					const remainingCues = this.store.cues()
					if (remainingCues && remainingCues.length === 3) {
						this.store.setSelectedCues([...remainingCues])
						this.store.setGamePlayState(GamePlayState.CHECK_SOLUTION)
					}

					// If the game is in its initial state and there are no cues left, fetch the final triad cues and progress the game to the final stage
					if (this.store.triadsStep() === 'INITIAL' && this.store.cues()?.length === 0) {
						this.store.updateTriadStep('FINAL')

						void this.loadFinalTriadCues()
					}
					// If the game was in its final stage and the player answers the last triad, finalize the game.
					else if (this.store.triadsStep() === 'FINAL') {
						this.gamePlayLogic.handleGameWon()
					} else {
						this.store.updateTriadStep('INITIAL')
					}
				} else {
					// If the game was in its initial stage and the player ran out of turns
					if (this.turnHintService.numberOfAvailableTurns(this.store.turns()) === 0) {
						this.gamePlayLogic.handleGameLost()
					} else {
						const availableHints = this.store.hints().filter((hint) => hint.available).length
						const triadsStep = this.store.triadsStep()
						const initialCues = this.store.cues()
						const finalTriadCuesList = this.store.finalTriadCues()
						const onlyThreeCuesRemain =
							(triadsStep === 'INITIAL' && initialCues?.length === 3) || (triadsStep === 'FINAL' && finalTriadCuesList?.length === 3)
						const forcedSelection: string[] | null = onlyThreeCuesRemain
							? triadsStep === 'FINAL' && finalTriadCuesList
								? [...finalTriadCuesList]
								: initialCues
									? [...initialCues]
									: null
							: null

						if (availableHints === 0) {
							if (forcedSelection && forcedSelection.length === 3) {
								this.store.setSelectedCues(forcedSelection)
								this.store.setGamePlayState(GamePlayState.ACCEPT_ANSWER)
								this.shouldFocusAnswerField = !this.isErasing
							} else {
								const letterHintsStillEntitled =
									(this.store.keywordLengthHint() !== null || this.store.firstLetterHint() !== null) && this.store.selectedCues().length === 3
								if (letterHintsStillEntitled) {
									// Do not clear selectedCues: that would wipe letter-hint state in the store.
									this.store.setGamePlayState(GamePlayState.ACCEPT_ANSWER)
									this.shouldFocusAnswerField = !this.isErasing
								} else {
									this.store.setGamePlayState(GamePlayState.PLAYING)
									this.store.setSelectedCues([])
								}
							}
						} else {
							if (forcedSelection && forcedSelection.length === 3) {
								this.store.setSelectedCues(forcedSelection)
							}
							this.store.setGamePlayState(GamePlayState.ACCEPT_ANSWER)
							this.shouldFocusAnswerField = !this.isErasing
						}
					}
				}
			}

			this.store.setHintUsage(false)
			this.store.setHintUsedWithOneTurnRemaining(false)
		}, 2000)
		this.timeoutIds.push(timeoutId)
	}

	private handleApiError(error: unknown): void {
		const apiError = isApiError(error) ? error : parseApiError(error)
		apiError.markHandled()

		const answerMessages = apiError.fieldErrors.get('answer')
		if (apiError.isValidation && answerMessages?.[0]) {
			this.answerFormControl.setErrors({ server: answerMessages[0] })
			this.answerFormControl.markAsDirty()
			this.serverError.set(null)
			return
		}

		if (this.answerFormControl.errors?.['server']) {
			const remainingErrors = { ...this.answerFormControl.errors }
			delete remainingErrors['server']
			this.answerFormControl.setErrors(Object.keys(remainingErrors).length > 0 ? remainingErrors : null)
		}

		this.serverError.set(apiError.userMessage)
	}

	private applyOrganicFail() {
		try {
			const { turns, hints, gameEnds } = this.turnHintService.applyFailure(this.store.turns(), this.store.hints())
			this.store.setTurns(turns)
			this.store.setHints(hints)

			if (gameEnds) {
				this.gamePlayLogic.handleGameLost()
			}
		} catch {
			this.serverError.set('Something went wrong. Please try again.')
		}
	}

	async loadFinalTriadCues() {
		const triadGroupId = this.store.triadGroupId()
		if (!triadGroupId || this.isBusy() || this.store.triadsStep() !== 'FINAL' || this.store.finalTriadCues()?.length) return
		this.serverError.set(null)
		this.store.setIsFetchingFinalTriadCues(true)
		const generation = this.requestGeneration
		try {
			const cues = await firstValueFrom(this.gamePlayApi.fetchFinalTriadCues(triadGroupId).pipe(takeUntil(this.requestsCancelled$)))
			if (this.destroyed || generation !== this.requestGeneration) return
			if (!cues || cues.length !== 3) throw new Error('Invalid bonus cues')
			this.store.setFinalTriadCues(cues)
			this.store.setSelectedCues([...cues])
			this.store.setGamePlayState(GamePlayState.CHECK_SOLUTION)
		} catch (error) {
			if (!this.destroyed && generation === this.requestGeneration) this.handleApiError(error)
		} finally {
			if (!this.destroyed && generation === this.requestGeneration) this.store.setIsFetchingFinalTriadCues(false)
		}
	}

	private subscribeToAnswerFieldChanges() {
		this.subscriptions$.add(
			this.gamePlayLogic.answerFieldFocus$.pipe(filter((focus) => focus)).subscribe({
				next: () => {
					setTimeout(() => {
						if (this.store.keywordLengthHint() !== null) {
							this.letterInputsRef()?.focusForRetry()
							return
						}
						const el = this.answerFieldRef()?.nativeElement

						if (el) {
							this.answerFormControl.enable()
							el.disabled = false

							el.focus()
						}
					}, 0)
				},
			}),
		)

		this.subscriptions$.add(
			this.gamePlayLogic.answerFieldValue$.pipe(filter((value) => value != null)).subscribe({
				next: (value) => {
					this.answerFormControl.setValue(value)
				},
			}),
		)
	}
}

import { DatePipe } from '@angular/common'
import { Component, computed, effect, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { gsap } from 'gsap'
import { AnimationOptions, LottieComponent } from 'ngx-lottie'
import { Subscription } from 'rxjs'

import { Intro } from '../../shared/components/intro/intro'
import { Difficulty } from '../../shared/enums/difficulty.enum'
import { RequestState } from '../../shared/enums/request-state.enum'
import { isApiError, parseApiError } from '../../shared/errors/api-error.util'
import { TriadHintSnapshot } from '../../shared/interfaces/global-state.interface'
import { AssetPreloadService } from '../../shared/services/asset-preload.service'
import { DailyPostPlayService } from '../../shared/services/daily-post-play.service'
import { DailyRolloverService } from '../../shared/services/daily-rollover.service'
import { DifficultyService } from '../../shared/services/difficulty.service'
import { GameCuePrefetchService } from '../../shared/services/game-cue-prefetch.service'
import { extractClassicExtraQuota } from '../../shared/utils/classic-extra.util'
import { GlobalStore } from '../../state/global.store'
import { AnswerDialog } from './components/answer-dialog/answer-dialog'
import { BackgroundBubbles } from './components/background-bubbles/background-bubbles'
import { BubbleContainer } from './components/bubble-container/bubble-container'
import { GameResultDialog } from './components/game-result-dialog/game-result-dialog'
import { HintsBox } from './components/hints-box/hints-box'
import { SolutionSection } from './components/solution-section/solution-section'
import { SolvedTriad } from './components/solved-triad/solved-triad'
import { TurnsBox } from './components/turns-box/turns-box'
import { WelcomeDialog } from './components/welcome-dialog/welcome-dialog'
import { GAME_END_MESSAGES_CLASSIC, GAME_END_MESSAGES_DAILY, WRONG_MESSAGES } from './constants/game-play.constant'
import { GamePlayState } from './enums/game-play.enum'
import { SolvedTriad as SolvedTriadInterface } from './interfaces/triad.interface'
import { TurnAndHint } from './interfaces/turn-and-hint.interface'
import { GamePlayApi } from './services/game-play-api'
import { GamePlayLogic } from './services/game-play-logic'

const LOADING_LOTTIE_PATH = 'lotties/loading-lottie.json'
const DAILY_GAME_SESSION_STORAGE_KEY = 'triads_daily_game_session_v1'
const DAILY_PROGRESS_SAVE_DEBOUNCE_MS = 500

interface DailyGameSessionSnapshot {
	puzzleDate: string
	triadGroupId: string | number
	cues: string[] | null
	finalTriadCues: string[] | null
	selectedCues: string[]
	turns: TurnAndHint[]
	hints: TurnAndHint[]
	gamePlayState: GamePlayState
	triadsStep: 'INITIAL' | 'FINAL'
	keywordLengthHint: number | null
	firstLetterHint: string | null
	activeHintType: 'KEYWORD_LENGTH' | 'FIRST_LETTER' | null
	usedHintTypes: ('KEYWORD_LENGTH' | 'FIRST_LETTER')[]
	triadHintSnapshots: Record<string, TriadHintSnapshot>
	solvedTriads: SolvedTriadInterface[]
	hintUsed: boolean
	hintUsedWithOneTurnRemaining: boolean
	gameScore: number
	unsolvedTriads: SolvedTriadInterface[] | null
	dailyNextPuzzleAt: string | null
}

@Component({
	selector: 'app-game-play',
	imports: [
		DatePipe,
		LottieComponent,
		ReactiveFormsModule,
		FormsModule,
		BackgroundBubbles,
		SolutionSection,
		TurnsBox,
		HintsBox,
		AnswerDialog,
		GameResultDialog,
		SolvedTriad,
		BubbleContainer,
		WelcomeDialog,
		Intro,
	],
	templateUrl: './game-play.html',
	styleUrl: './game-play.scss',
})
export class GamePlay implements OnInit, OnDestroy {
	readonly store = inject(GlobalStore)

	cueFetchingState = signal<RequestState>(RequestState.LOADING)

	explodingBubbles = signal<string[]>([])

	availableTurns = computed(() => this.store.turns().filter((turn) => turn.available).length)

	isGameOver = computed(() => {
		const gameState = this.store.gamePlayState()
		return gameState === GamePlayState.WON || gameState === GamePlayState.LOST
	})

	answerDialogMessage = computed(() => {
		const gameState = this.store.gamePlayState()

		if (gameState === GamePlayState.WRONG_ANSWER) {
			return this.generateWrongAnswerMessage()
		} else if (gameState === GamePlayState.WON || gameState === GamePlayState.LOST) {
			return this.generateGameResultMessage()
		}

		return ''
	})

	readonly loadingAnimationOptions = computed<AnimationOptions>(() => {
		this.assetPreloadService.lottieVersion()
		const animationData = this.assetPreloadService.getLottie(LOADING_LOTTIE_PATH)
		return animationData ? { animationData } : { path: LOADING_LOTTIE_PATH }
	})

	noTriadsMessage = signal<string>('')

	selectedDifficulty = signal<Difficulty>(Difficulty.RANDOM)

	showWelcomeDialog = signal<boolean>(false)

	welcomeDialogTotalPoints = signal<number>(0)

	private welcomeShownThisSession = false

	protected readonly RequestState = RequestState

	protected readonly length = length

	protected readonly GamePlayState = GamePlayState

	protected readonly Difficulty = Difficulty

	showMainGameShell = computed(() => !this.store.dailyStandaloneResult())

	private readonly gamePlayApi = inject(GamePlayApi)

	private readonly gamePlayLogic = inject(GamePlayLogic)

	private readonly difficultyService = inject(DifficultyService)

	private readonly assetPreloadService = inject(AssetPreloadService)

	private readonly dailyPostPlayService = inject(DailyPostPlayService)

	private readonly dailyRolloverService = inject(DailyRolloverService)

	private readonly gameCuePrefetch = inject(GameCuePrefetchService)

	private readonly router = inject(Router)

	private subscriptions$ = new Subscription()

	private readonly solutionSectionRef = viewChild<SolutionSection>('solutionSection')

	private stopEasternDayWatcher: (() => void) | null = null

	private dailyProgressSaveTimeout: ReturnType<typeof setTimeout> | null = null

	private lastServerSavedSnapshot: string | null = null

	private dailyProgressSubscription: Subscription | null = null

	private pendingDailyProgressSnapshot: DailyGameSessionSnapshot | null = null

	private readonly flushDailyProgressOnHide = () => {
		if (document.visibilityState === 'hidden') {
			this.sendPendingDailyProgressNow()
		}
	}

	private readonly flushDailyProgressOnPagehide = () => {
		this.sendPendingDailyProgressNow()
	}

	/**
	 * Eastern-time date key for the play content currently on screen, for both Daily and Classic
	 * Extra. Recorded whenever the view loads any content (playable puzzle/board, no-schedule, error,
	 * or completed result) so that on tab re-entry we can tell whether a rollover has made it stale.
	 * Robust even when the live midnight timer has already fired, and uniform across states that have
	 * no `puzzleDate`. See ADR-0002.
	 */
	private loadEasternDateKey: string | null = null

	constructor() {
		// Watch for game completion to check if welcome dialog should be shown
		effect(() => {
			const gameState = this.store.gamePlayState()
			if (gameState === GamePlayState.WON || gameState === GamePlayState.LOST) {
				this.checkAndShowWelcomeDialog()
			}
		})

		// Persist daily session progress so players can resume the same puzzle.
		effect(() => {
			if (this.store.gameMode() !== 'daily') {
				return
			}

			if (this.cueFetchingState() !== RequestState.READY && this.cueFetchingState() !== RequestState.IDLE) {
				return
			}

			const triadGroupId = this.store.triadGroupId()
			if (!triadGroupId) {
				return
			}

			const puzzleDate = this.getSavedDailySession()?.puzzleDate
			if (!puzzleDate) {
				return
			}

			const snapshot: DailyGameSessionSnapshot = {
				puzzleDate,
				triadGroupId,
				cues: this.store.cues(),
				finalTriadCues: this.store.finalTriadCues(),
				selectedCues: this.store.selectedCues(),
				turns: this.store.turns(),
				hints: this.store.hints(),
				gamePlayState: this.store.gamePlayState(),
				triadsStep: this.store.triadsStep(),
				keywordLengthHint: this.store.keywordLengthHint(),
				firstLetterHint: this.store.firstLetterHint(),
				activeHintType: this.store.activeHintType(),
				usedHintTypes: this.store.usedHintTypes(),
				triadHintSnapshots: this.store.triadHintSnapshots(),
				solvedTriads: this.store.solvedTriads(),
				hintUsed: this.store.hintUsed(),
				hintUsedWithOneTurnRemaining: this.store.hintUsedWithOneTurnRemaining(),
				gameScore: this.store.gameScore(),
				unsolvedTriads: this.store.unsolvedTriads(),
				dailyNextPuzzleAt: this.store.dailyNextPuzzleAt(),
			}
			this.saveDailySession(snapshot)
			// Won/Lost is finalised via postDailyComplete; the server clears progress at that point, so
			// don't also keep pushing snapshot patches after the game ends.
			if (snapshot.gamePlayState === GamePlayState.WON || snapshot.gamePlayState === GamePlayState.LOST) {
				return
			}
			this.queueDailyProgressServerSave(snapshot)
		})
	}

	ngOnInit() {
		// Initialize selected difficulty with current setting
		this.selectedDifficulty.set(this.difficultyService.getDifficulty())
		// The re-entry rollover guard applies to every play mode — Daily and Classic Extra alike
		// (ADR-0002). Returning to a backgrounded board after the Eastern day has changed routes home.
		// Intentionally no onTimerRollover: an actively-focused player must never be yanked off their
		// board the instant midnight passes; the new day is picked up only when they return to a stale tab.
		if (this.store.gameMode() !== 'standalone-classic') {
			this.stopEasternDayWatcher = this.dailyRolloverService.startEasternDayWatcher({
				onReentryRollover: () => this.handlePlayReentryRollover(),
			})
		}
		if (this.store.gameMode() === 'daily') {
			// iOS Safari can kill a backgrounded tab without firing ngOnDestroy; flush the debounced
			// progress save the moment the page becomes hidden so the server captures the latest
			// snapshot before the tab is discarded.
			document.addEventListener('visibilitychange', this.flushDailyProgressOnHide)
			window.addEventListener('pagehide', this.flushDailyProgressOnPagehide)
			this.initializeDailyGame()
		} else {
			this.initializeGame()
		}
	}

	ngOnDestroy() {
		this.stopEasternDayWatcher?.()
		this.stopEasternDayWatcher = null
		document.removeEventListener('visibilitychange', this.flushDailyProgressOnHide)
		window.removeEventListener('pagehide', this.flushDailyProgressOnPagehide)
		this.sendPendingDailyProgressNow()
		this.dailyProgressSubscription?.unsubscribe()
		this.dailyProgressSubscription = null
		// Reset game state when navigating away from the gameplay page
		if (this.store.gameMode() !== 'daily') {
			this.resetGameState()
		}
	}

	initializeDailyGame() {
		// Do NOT clear the saved daily session here. This method runs on every (re)entry to the
		// board, including the full page reload iOS Safari performs after discarding a backgrounded
		// tab. Clearing now would wipe resumable progress before the restore logic below can read it
		// (the backend now also stores progress, but it can fall behind on the very last few hundred
		// ms before a tab is killed). Stale sessions are still handled where it matters: the
		// no-schedule and already-completed branches clear explicitly, and a fresh puzzle overwrites
		// the snapshot.
		this.lastServerSavedSnapshot = null
		this.pendingDailyProgressSnapshot = null
		if (this.dailyProgressSaveTimeout) {
			clearTimeout(this.dailyProgressSaveTimeout)
			this.dailyProgressSaveTimeout = null
		}
		this.resetGameState()
		this.store.setFinalClassicExtraSession(false)
		this.cueFetchingState.set(RequestState.LOADING)
		this.noTriadsMessage.set('')
		this.store.setDailyNoScheduleMessage(null)
		this.store.setDailyStandaloneResult(false)
		this.store.setDailyReviewTriads(null)
		const dailyCues$ = this.gameCuePrefetch.consumeDailyCues() ?? this.gamePlayApi.getDailyCues()
		this.subscriptions$.add(
			dailyCues$.subscribe({
				next: (response) => {
					this.loadEasternDateKey = this.dailyRolloverService.getEasternDateKey()
					if (!response.scheduled) {
						this.clearDailySession()
						this.store.setDailyNoScheduleMessage(response.message)
						this.store.setDailyNextPuzzleAt(response.nextPuzzleAt)
						this.cueFetchingState.set(RequestState.EMPTY)
						return
					}
					this.store.setDailyPuzzleDate(response.puzzleDate)
					if (response.alreadyCompleted) {
						this.clearDailySession()
						this.store.setDailyNextPuzzleAt(response.nextPuzzleAt)
						this.store.setTriadGroupId(response.triadGroupId)
						this.store.setGameScore(response.score ?? 0)
						this.store.setDailyStandaloneResult(true)
						this.store.setGamePlayState(response.attemptStatus === 'WON' ? GamePlayState.WON : GamePlayState.LOST)
						this.prefetchDailyReviewTriads(response.triadGroupId)
						this.refreshClassicExtraQuota()
						this.cueFetchingState.set(RequestState.IDLE)
						return
					}

					// Server-side progress is the durable source of truth — it survives iOS Safari
					// clearing localStorage. Prefer it; only fall back to the local snapshot when the
					// server hasn't seen progress yet (legacy attempts).
					const serverSession = this.parseServerProgress(response.progress, response.puzzleDate, response.triadGroupId)
					if (serverSession) {
						this.applyDailySession(serverSession)
						this.lastServerSavedSnapshot = JSON.stringify(serverSession)
						return
					}

					const restoredSession = this.getSavedDailySession()
					const canRestoreSession = restoredSession?.puzzleDate === response.puzzleDate && restoredSession?.triadGroupId === response.triadGroupId
					if (canRestoreSession && restoredSession) {
						this.applyDailySession(restoredSession)
						// Server hasn't seen this snapshot yet — push it now so it's safe even if
						// localStorage gets evicted before the next state change.
						this.queueDailyProgressServerSave(restoredSession, { immediate: true })
						return
					}

					this.store.setDailyNextPuzzleAt(response.nextPuzzleAt)
					this.store.setCues(response.cues)
					this.store.setTriadGroupId(response.triadGroupId)
					const freshSnapshot: DailyGameSessionSnapshot = {
						puzzleDate: response.puzzleDate,
						triadGroupId: response.triadGroupId,
						cues: response.cues,
						finalTriadCues: null,
						selectedCues: [],
						turns: this.store.turns(),
						hints: this.store.hints(),
						gamePlayState: GamePlayState.PLAYING,
						triadsStep: 'INITIAL',
						keywordLengthHint: null,
						firstLetterHint: null,
						activeHintType: null,
						usedHintTypes: [],
						triadHintSnapshots: {},
						solvedTriads: [],
						hintUsed: false,
						hintUsedWithOneTurnRemaining: false,
						gameScore: 0,
						unsolvedTriads: null,
						dailyNextPuzzleAt: response.nextPuzzleAt,
					}
					this.saveDailySession(freshSnapshot)
					this.queueDailyProgressServerSave(freshSnapshot, { immediate: true })
					this.cueFetchingState.set(RequestState.READY)
					this.store.setGamePlayState(GamePlayState.PLAYING)
				},
				error: (error) => {
					this.loadEasternDateKey = this.dailyRolloverService.getEasternDateKey()
					const apiError = isApiError(error) ? error : parseApiError(error)
					apiError.markHandled()
					this.noTriadsMessage.set(apiError.userMessage)
					this.cueFetchingState.set(RequestState.ERROR)
				},
			}),
		)
	}

	initializeGame() {
		this.cueFetchingState.set(RequestState.LOADING)
		this.noTriadsMessage.set('')
		// Clear any leftover game state (e.g. solved triads from a previous daily game,
		// which intentionally skips the reset on destroy so it can be resumed). Without
		// this, the daily game's solved-triad chips bleed into a freshly started classic game.
		this.store.setUnsolvedTriads(null)
		this.store.resetGameState()
		const difficulty = this.difficultyService.getDifficulty()
		const classicCues$ =
			this.gameCuePrefetch.consumeClassicCues(difficulty) ??
			(this.store.gameMode() === 'standalone-classic' ? this.gamePlayApi.getStandaloneClassicCues(difficulty) : this.gamePlayApi.getCues(difficulty))
		this.subscriptions$.add(
			classicCues$.subscribe({
				next: (response) => {
					this.loadEasternDateKey = this.dailyRolloverService.getEasternDateKey()
					const quota = this.store.gameMode() === 'classic' ? extractClassicExtraQuota(response) : null
					if (quota) {
						this.store.setClassicExtraQuota(quota)
						this.store.setFinalClassicExtraSession(quota.classicExtrasRemaining === 0)
					} else {
						this.store.setFinalClassicExtraSession(false)
					}

					// Check if cues is null or empty array (backend returns null when no triads found)
					if (!response.cues || response.cues.length === 0) {
						// Use backend message if available, otherwise generate a default message
						const message =
							response.message ||
							`No triads available for ${this.getDifficultyLabel(difficulty)} difficulty. Please try a different difficulty level.`
						this.noTriadsMessage.set(message)
						this.selectedDifficulty.set(difficulty)
						this.cueFetchingState.set(RequestState.EMPTY)
						return
					}
					// this.store.setTriadsGroup({ id: cues.id, triads: cues.triads.map((triad) => ({ ...triad, available: true })) })
					this.store.setCues(response.cues)
					this.store.setTriadGroupId(response.triadGroupId)
					this.cueFetchingState.set(RequestState.READY)
					this.store.setGamePlayState(GamePlayState.PLAYING)
				},
				error: (error) => {
					this.loadEasternDateKey = this.dailyRolloverService.getEasternDateKey()
					const apiError = isApiError(error) ? error : parseApiError(error)
					apiError.markHandled()
					const quota = this.store.gameMode() === 'classic' ? extractClassicExtraQuota(apiError.originalResponse?.error) : null
					if (quota) {
						this.store.setClassicExtraQuota(quota)
						this.store.setFinalClassicExtraSession(quota.classicExtrasRemaining === 0)
					}
					if (apiError.statusCode === 403) {
						void this.router.navigate(['/'])
						return
					}
					this.noTriadsMessage.set(apiError.userMessage)
					this.selectedDifficulty.set(difficulty)
					this.cueFetchingState.set(RequestState.ERROR)
				},
			}),
		)
	}

	retryGame() {
		if (this.store.gameMode() === 'daily') {
			this.initializeDailyGame()
			return
		}
		// Use the selected difficulty from the dropdown and save it
		const selectedDifficulty = this.selectedDifficulty()
		this.difficultyService.setDifficulty(selectedDifficulty)
		this.initializeGame()
	}

	onDifficultyChange(difficulty: Difficulty) {
		this.selectedDifficulty.set(difficulty)
		// Update global difficulty value in localStorage immediately
		this.difficultyService.setDifficulty(difficulty)
	}

	goToHome() {
		this.router.navigate(['/'])
	}

	restartGame() {
		if (this.store.gameMode() === 'daily') {
			this.resetGameState()
			this.initializeDailyGame()
			return
		}
		this.resetGameState()
		this.initializeGame()
	}

	async moveToSolvedArea(solvedTriad: SolvedTriadInterface) {
		this.explodingBubbles.set(solvedTriad.cues)

		// Find the solved area element
		const solvedArea = document.getElementById(`solved-${solvedTriad.id}`)
		if (!solvedArea) return

		const allBubbles = Array.from(document.querySelectorAll('[id^="bubble-"]'))
		const bubbleAnimations: Promise<void>[] = []

		// Find all 3 bubble elements and create sequential animations
		for (let i = 0; i < solvedTriad.cues.length; i++) {
			const cue = solvedTriad.cues[i]
			let bubbleElement: Element | null = null

			// Find the bubble with the matching cue text
			for (const elem of allBubbles) {
				const cueElement = elem.querySelector('p')
				if (cueElement && cueElement.textContent?.trim() === cue) {
					bubbleElement = elem
					break
				}
			}

			if (!bubbleElement) continue

			// Calculate perfect alignment to the center of the solved-triad component
			const solvedAreaRect = solvedArea.getBoundingClientRect()
			const bubbleRect = bubbleElement.getBoundingClientRect()

			// Calculate the center position of the solved-triad component
			const targetX = solvedAreaRect.left + solvedAreaRect.width / 2 - bubbleRect.left
			const targetY = solvedAreaRect.top + solvedAreaRect.height / 2 - bubbleRect.top

			// Create sequential animation with delay between each bubble
			const animationPromise = new Promise<void>((resolve) => {
				gsap.to(bubbleElement, {
					delay: 0.5 + i * 0.2, // 0.2s delay between each bubble start (reduced from 0.4s)
					duration: 0.6, // Reduced from 1.2s to 0.6s (50% faster)
					x: targetX, // Perfect center alignment
					y: targetY,
					scale: 0.2,
					opacity: 0.1,
					ease: 'power2.inOut',
					onComplete: () => {
						// Hide the bubble after animation
						;(bubbleElement as HTMLElement).style.display = 'none'
						resolve()
					},
				})
			})

			bubbleAnimations.push(animationPromise)
		}

		// Wait for all animations to complete
		await Promise.all(bubbleAnimations)

		// Animate the solved-triad component appearance
		await this.animateSolvedTriadAppearance(solvedArea)
	}

	generateWrongAnswerMessage() {
		return WRONG_MESSAGES[Math.floor(Math.random() * WRONG_MESSAGES.length)]
	}

	generateGameResultMessage() {
		if (this.store.gameMode() === 'classic' && this.store.isFinalClassicExtraSession()) {
			return ''
		}
		const gameScore = this.store.gameScore()
		const gameEndMessages = this.store.gameMode() === 'daily' ? GAME_END_MESSAGES_DAILY : GAME_END_MESSAGES_CLASSIC
		return gameEndMessages[gameScore]
	}

	checkAndShowWelcomeDialog() {
		if (this.store.gameMode() === 'daily') {
			return
		}
		const user = this.store.user()
		if (!user || !user.scores || user.welcomeMessageShown) {
			return
		}

		if (this.welcomeShownThisSession) {
			return
		}

		const totalGamesPlayed = Object.values(user.scores).reduce((sum, count) => sum + count, 0)
		if (totalGamesPlayed < 5) {
			return
		}

		const winCounts = Object.entries(user.scores).reduce((sum, [score, count]) => {
			const numericScore = Number(score)
			return numericScore > 0 ? sum + count : sum
		}, 0)

		const successRate = totalGamesPlayed > 0 ? winCounts / totalGamesPlayed : 0

		if (successRate >= 0.6) {
			this.welcomeDialogTotalPoints.set(Math.round(successRate * 100))
			this.welcomeShownThisSession = true
			this.showWelcomeDialog.set(true)
		}
	}

	onWelcomeDialogClosed() {
		this.showWelcomeDialog.set(false)
	}

	onWelcomeDialogDontShowAgain() {
		this.showWelcomeDialog.set(false)

		const user = this.store.user()
		if (!user) {
			return
		}

		const updatedUser = { ...user, welcomeMessageShown: true }
		this.store.setUser(updatedUser)
		this.store.userService.setUser(updatedUser)
	}

	private resetGameState() {
		// Clear existing subscriptions to avoid memory leaks
		this.subscriptions$.unsubscribe()
		// Create a new subscription object
		this.subscriptions$ = new Subscription()
		// Reset local component state
		this.cueFetchingState.set(RequestState.LOADING)
		this.explodingBubbles.set([])
		this.noTriadsMessage.set('')
		this.store.setDailyNoScheduleMessage(null)
		this.store.setDailyStandaloneResult(false)
		this.store.setDailyReviewTriads(null)
		this.showWelcomeDialog.set(false)
		this.welcomeDialogTotalPoints.set(0)
		// Reset GamePlayLogic BehaviorSubjects
		this.gamePlayLogic.resetAnswerFieldState()
		// Reset SolutionSection component state
		const solutionSection = this.solutionSectionRef()
		if (solutionSection) {
			solutionSection.resetComponentState()
		}
		// Reset global store game state
		this.store.setUnsolvedTriads(null)
		this.store.resetGameState()
	}

	private getDifficultyLabel(difficulty: string): string {
		const labels: Record<string, string> = {
			EASY: 'Soft',
			MEDIUM: 'Firm',
			HARD: 'Hard',
			RANDOM: 'Mixed',
		}
		return labels[difficulty] || difficulty
	}

	private prefetchDailyReviewTriads(triadGroupId: string | number) {
		void this.dailyPostPlayService.loadReviewTriads(triadGroupId).then(
			(triads) => this.store.setDailyReviewTriads(triads),
			() => this.store.setDailyReviewTriads(null),
		)
	}

	/**
	 * On returning to a backgrounded play tab, route home if a rollover has made the on-screen
	 * content stale, so the next play passes through the home brain-warming intro instead of the
	 * board auto-populating or a stale Classic Extra / Play-More screen lingering. Applies to every
	 * play mode (Daily and Classic Extra) and every state (in-progress, completed, no-schedule,
	 * error); the stale localStorage daily session is discarded on the next load because its
	 * puzzleDate no longer matches today. See ADR-0002.
	 */
	private handlePlayReentryRollover() {
		if (!this.loadEasternDateKey) {
			return
		}
		if (this.loadEasternDateKey === this.dailyRolloverService.getEasternDateKey()) {
			return
		}
		void this.router.navigate(['/'])
	}

	private applyDailySession(session: DailyGameSessionSnapshot) {
		this.store.resetGameState()
		this.store.setDailyNextPuzzleAt(session.dailyNextPuzzleAt)
		this.store.setCues(session.cues ?? [])
		this.store.setTriadGroupId(session.triadGroupId)
		this.store.setFinalTriadCues(session.finalTriadCues)
		this.store.setSelectedCues(session.selectedCues)
		this.store.setTurns(session.turns)
		this.store.setHints(session.hints)
		this.store.setGamePlayState(session.gamePlayState)
		this.store.updateTriadStep(session.triadsStep)
		this.store.setKeywordLengthHint(session.keywordLengthHint)
		this.store.setFirstLetterHint(session.firstLetterHint)
		this.store.setActiveHintType(session.activeHintType)
		this.store.resetUsedHintTypes()
		for (const hintType of session.usedHintTypes) {
			this.store.addUsedHintType(hintType)
		}
		this.store.setTriadHintSnapshots(session.triadHintSnapshots ?? {})
		this.store.setHintUsage(session.hintUsed)
		this.store.setHintUsedWithOneTurnRemaining(session.hintUsedWithOneTurnRemaining)
		this.store.setGameScore(session.gameScore)
		this.store.setUnsolvedTriads(session.unsolvedTriads)
		this.store.setDailyStandaloneResult(session.gamePlayState === GamePlayState.WON || session.gamePlayState === GamePlayState.LOST)
		for (const solvedTriad of session.solvedTriads) {
			this.store.addSolvedTriad(solvedTriad)
		}
		this.cueFetchingState.set(RequestState.READY)
	}

	private getSavedDailySession(): DailyGameSessionSnapshot | null {
		const rawSnapshot = localStorage.getItem(DAILY_GAME_SESSION_STORAGE_KEY)
		if (!rawSnapshot) {
			return null
		}

		try {
			return JSON.parse(rawSnapshot) as DailyGameSessionSnapshot
		} catch {
			this.clearDailySession()
			return null
		}
	}

	private saveDailySession(session: DailyGameSessionSnapshot) {
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(session))
	}

	private clearDailySession() {
		localStorage.removeItem(DAILY_GAME_SESSION_STORAGE_KEY)
	}

	private parseServerProgress(
		raw: Record<string, unknown> | null | undefined,
		puzzleDate: string,
		triadGroupId: string | number,
	): DailyGameSessionSnapshot | null {
		if (!raw || typeof raw !== 'object') {
			return null
		}
		const snapshot = raw as Partial<DailyGameSessionSnapshot>
		if (snapshot.puzzleDate !== puzzleDate || snapshot.triadGroupId !== triadGroupId) {
			return null
		}
		return snapshot as DailyGameSessionSnapshot
	}

	private queueDailyProgressServerSave(snapshot: DailyGameSessionSnapshot, options: { immediate?: boolean } = {}) {
		const serialized = JSON.stringify(snapshot)
		if (serialized === this.lastServerSavedSnapshot) {
			return
		}
		this.pendingDailyProgressSnapshot = snapshot
		if (this.dailyProgressSaveTimeout) {
			clearTimeout(this.dailyProgressSaveTimeout)
			this.dailyProgressSaveTimeout = null
		}
		if (options.immediate) {
			this.sendPendingDailyProgressNow()
			return
		}
		this.dailyProgressSaveTimeout = setTimeout(() => this.sendPendingDailyProgressNow(), DAILY_PROGRESS_SAVE_DEBOUNCE_MS)
	}

	private sendPendingDailyProgressNow() {
		if (this.dailyProgressSaveTimeout) {
			clearTimeout(this.dailyProgressSaveTimeout)
			this.dailyProgressSaveTimeout = null
		}
		const snapshot = this.pendingDailyProgressSnapshot
		if (!snapshot) {
			return
		}
		const serialized = JSON.stringify(snapshot)
		if (serialized === this.lastServerSavedSnapshot) {
			this.pendingDailyProgressSnapshot = null
			return
		}
		this.pendingDailyProgressSnapshot = null
		this.lastServerSavedSnapshot = serialized
		this.dailyProgressSubscription?.unsubscribe()
		this.dailyProgressSubscription = this.gamePlayApi.putDailyProgress(snapshot as unknown as Record<string, unknown>).subscribe({
			error: () => {
				// Allow a retry on the next change if the save failed.
				this.lastServerSavedSnapshot = null
			},
		})
		this.subscriptions$.add(this.dailyProgressSubscription)
	}

	private refreshClassicExtraQuota() {
		this.subscriptions$.add(
			this.gamePlayApi.getDailyTodayInfo().subscribe({
				next: (info) => {
					const quota = extractClassicExtraQuota(info)
					if (quota) {
						this.store.setClassicExtraQuota(quota)
					}
				},
			}),
		)
	}

	private async animateSolvedTriadAppearance(solvedArea: HTMLElement) {
		// Start with the solved component hidden and small
		gsap.set(solvedArea, { scale: 0, opacity: 0 })

		// Animate it to appear with a bounce effect
		await gsap.to(solvedArea, {
			duration: 0.8,
			scale: 1,
			opacity: 0.65,
			ease: 'back.out(1.7)',
		})
	}
}

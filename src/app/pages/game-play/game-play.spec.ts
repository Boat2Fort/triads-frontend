import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { of } from 'rxjs'

import { Difficulty } from '../../shared/enums/difficulty.enum'
import { AssetPreloadService } from '../../shared/services/asset-preload.service'
import { DailyPostPlayService } from '../../shared/services/daily-post-play.service'
import { DailyRolloverService } from '../../shared/services/daily-rollover.service'
import { DifficultyService } from '../../shared/services/difficulty.service'
import { GameCuePrefetchService } from '../../shared/services/game-cue-prefetch.service'
import { GlobalStore } from '../../state/global.store'
import { GamePlayState } from './enums/game-play.enum'
import { GamePlay } from './game-play'
import { DailyCuesResponse, GamePlayApi } from './services/game-play-api'
import { GamePlayLogic } from './services/game-play-logic'

// Mirrors the private DAILY_GAME_SESSION_STORAGE_KEY in game-play.ts.
const DAILY_GAME_SESSION_STORAGE_KEY = 'triads_daily_game_session_v1'
const TODAY = '2026-06-16'

/** A daily session snapshot with two triads already solved, as persisted mid-puzzle. */
function savedSessionWith(puzzleDate: string) {
	return {
		savedAt: 1,
		puzzleDate,
		triadGroupId: 42,
		cues: ['FILM', 'SEA', 'SUPER'],
		finalTriadCues: null,
		selectedCues: [] as string[],
		turns: [
			{ id: 1, available: true, icon: 'images/turn-one.png' },
			{ id: 2, available: true, icon: 'images/turn-two.png' },
			{ id: 3, available: true, icon: 'images/turn-three.png' },
		],
		hints: [
			{ id: 1, available: true },
			{ id: 2, available: true },
		],
		gamePlayState: GamePlayState.PLAYING,
		triadsStep: 'INITIAL',
		keywordLengthHint: null,
		firstLetterHint: null,
		activeHintType: null,
		usedHintTypes: [],
		triadHintSnapshots: {},
		solvedTriads: [
			{ id: 1, keyword: 'HAND', cues: ['SECOND', 'POKER', 'SHAKE'], fullPhrases: ['SECONDHAND', 'POKER HAND', 'HANDSHAKE'] },
			{ id: 2, keyword: 'LINE', cues: ['DEAD', 'LAND', 'PIPE'], fullPhrases: ['DEADLINE', 'LANDLINE', 'PIPELINE'] },
		],
		hintUsed: false,
		hintUsedWithOneTurnRemaining: false,
		gameScore: 2,
		unsolvedTriads: null,
		dailyNextPuzzleAt: '2026-06-17T05:00:00.000Z',
	}
}

const inProgressResponse: DailyCuesResponse = {
	scheduled: true,
	alreadyCompleted: false,
	attemptStatus: 'IN_PROGRESS',
	triadGroupId: 42,
	cues: ['SECOND', 'POKER', 'SHAKE', 'DEAD', 'LAND', 'PIPE'],
	progress: null,
	puzzleDate: TODAY,
	nextPuzzleAt: '2026-06-17T05:00:00.000Z',
}

const classicCuesResponse = {
	triadGroupId: 7,
	cues: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
}

describe('GamePlay', () => {
	let component: GamePlay
	let fixture: ComponentFixture<GamePlay>
	let router: jasmine.SpyObj<Router>
	let currentEasternDateKey: string
	let reentryRollover: (() => void) | undefined

	beforeEach(async () => {
		localStorage.clear()
		currentEasternDateKey = TODAY
		reentryRollover = undefined

		router = jasmine.createSpyObj<Router>('Router', ['navigate'])
		router.navigate.and.resolveTo(true)

		await TestBed.configureTestingModule({
			imports: [GamePlay],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{
					provide: GamePlayApi,
					useValue: {
						postDailyComplete: jasmine
							.createSpy('postDailyComplete')
							.and.returnValue(of({ ok: true, puzzleDate: TODAY, nextPuzzleAt: '2026-06-17T04:00:00Z' })),
						putDailyProgress: jasmine.createSpy('putDailyProgress').and.returnValue(of({ ok: true, ignored: false })),
						getDailyCues: jasmine.createSpy('getDailyCues').and.returnValue(of(inProgressResponse)),
						getDailyTodayInfo: jasmine.createSpy('getDailyTodayInfo').and.returnValue(of({ scheduled: false, puzzleDate: TODAY })),
						getCues: jasmine.createSpy('getCues').and.returnValue(of(classicCuesResponse)),
					},
				},
				{
					provide: GameCuePrefetchService,
					useValue: {
						consumeDailyCues: () => null,
						consumeClassicCues: () => null,
						startPrefetch: jasmine.createSpy('startPrefetch'),
						clear: jasmine.createSpy('clear'),
					},
				},
				{
					// Captures the re-entry handler and reads a mutable Eastern date, so a test can simulate
					// returning to a backgrounded tab after the day has rolled over.
					provide: DailyRolloverService,
					useValue: {
						startEasternDayWatcher: (handlers: { onReentryRollover?: () => void }) => {
							reentryRollover = handlers.onReentryRollover
							return jasmine.createSpy('stopEasternDayWatcher')
						},
						getEasternDateKey: () => currentEasternDateKey,
					},
				},
				{ provide: DailyPostPlayService, useValue: { loadReviewTriads: () => Promise.resolve([]) } },
				{ provide: DifficultyService, useValue: { getDifficulty: () => Difficulty.RANDOM, setDifficulty: jasmine.createSpy('setDifficulty') } },
				{
					provide: GamePlayLogic,
					useValue: {
						resetAnswerFieldState: jasmine.createSpy('resetAnswerFieldState'),
						handleGameWon: jasmine.createSpy('handleGameWon'),
						handleGameLost: jasmine.createSpy('handleGameLost'),
					},
				},
				{
					provide: AssetPreloadService,
					useValue: {
						lottieVersion: () => 0,
						getLottie: () => null,
						imageVersion: () => 0,
						getImageUrl: (path: string) => path,
						playSound: jasmine.createSpy('playSound'),
					},
				},
				{ provide: Router, useValue: router },
			],
		}).compileComponents()

		fixture = TestBed.createComponent(GamePlay)
		component = fixture.componentInstance
	})

	afterEach(() => {
		localStorage.clear()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	// Regression: iOS Safari discards a backgrounded tab and fully reloads it on return, which re-runs
	// initializeDailyGame(). The in-progress solved triads (persisted only in localStorage) must survive
	// that reload instead of resetting the board to all 9 bubbles.
	it('restores solved triads from the saved session after a mid-puzzle reload', () => {
		const store = TestBed.inject(GlobalStore)
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(savedSessionWith(TODAY)))
		store.setGameMode('daily')

		// Simulates the fresh page load: ngOnInit -> initializeDailyGame (getDailyCues resolves synchronously).
		component.ngOnInit()

		expect(store.solvedTriads().length).toBe(2)
		expect(store.solvedTriads().map((triad) => triad.keyword)).toEqual(['HAND', 'LINE'])
		expect(store.dailyPuzzleDate()).toBe(TODAY)
		expect(store.gamePlayState()).toBe(GamePlayState.CHECK_SOLUTION)
	})

	// Guard: a leftover snapshot from a previous day's puzzle must NOT be restored — the player starts
	// today's puzzle fresh. This locks in that removing the unconditional clear didn't resurrect stale state.
	it('starts fresh when the saved session is for a different puzzle date', () => {
		const store = TestBed.inject(GlobalStore)
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(savedSessionWith('2026-06-15')))
		store.setGameMode('daily')

		component.ngOnInit()

		expect(store.solvedTriads().length).toBe(0)
		expect(store.cues()).toEqual(inProgressResponse.scheduled && !inProgressResponse.alreadyCompleted ? inProgressResponse.cues : null)
	})

	// ADR-0002: the re-entry rollover guard now covers Classic Extra play, not just the Daily. A bonus
	// board left open across the Eastern midnight must route the returning player home for a clean slate.
	it('routes home on re-entry after the Eastern day changes during Classic Extra play', () => {
		TestBed.inject(GlobalStore).setGameMode('classic')
		component.ngOnInit()

		// A new Eastern day began while the tab was backgrounded.
		currentEasternDateKey = '2026-06-17'
		reentryRollover?.()

		expect(router.navigate).toHaveBeenCalledWith(['/'])
	})

	it('stays put on re-entry within the same Eastern day during Classic Extra play', () => {
		TestBed.inject(GlobalStore).setGameMode('classic')
		component.ngOnInit()

		reentryRollover?.()

		expect(router.navigate).not.toHaveBeenCalled()
	})

	it('routes home on re-entry after the Eastern day changes during the Daily', () => {
		const store = TestBed.inject(GlobalStore)
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(savedSessionWith(TODAY)))
		store.setGameMode('daily')
		component.ngOnInit()

		currentEasternDateKey = '2026-06-17'
		reentryRollover?.()

		expect(router.navigate).toHaveBeenCalledWith(['/'])
	})
	it('finishes bubble removal when reloading during a correct-answer animation', () => {
		const store = TestBed.inject(GlobalStore)
		const session = savedSessionWith(TODAY)
		session.cues = ['SECOND', 'POKER', 'SHAKE', 'FILM', 'SEA', 'SUPER']
		session.selectedCues = ['SECOND', 'POKER', 'SHAKE']
		session.gamePlayState = GamePlayState.CORRECT_ANSWER
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(session))
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.cues()).toEqual(['FILM', 'SEA', 'SUPER'])
		expect(store.selectedCues()).toEqual(['FILM', 'SEA', 'SUPER'])
		expect(store.gamePlayState()).toBe(GamePlayState.CHECK_SOLUTION)
	})

	it('restores a wrong-answer animation to an answerable state without charging another turn', () => {
		const store = TestBed.inject(GlobalStore)
		const session = savedSessionWith(TODAY)
		session.selectedCues = [...session.cues]
		session.gamePlayState = GamePlayState.WRONG_ANSWER
		session.turns[2].available = false
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(session))
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.gamePlayState()).toBe(GamePlayState.ACCEPT_ANSWER)
		expect(store.turns().filter((t) => t.available).length).toBe(2)
	})

	it('makes a missing bonus load recoverable when reloading after the third solve', () => {
		const store = TestBed.inject(GlobalStore)
		const session = savedSessionWith(TODAY)
		session.solvedTriads.push({ id: 3, keyword: 'STAR', cues: ['FILM', 'SEA', 'SUPER'], fullPhrases: ['FILM STAR', 'SEA STAR', 'SUPERSTAR'] })
		session.selectedCues = [...session.cues]
		session.gamePlayState = GamePlayState.CORRECT_ANSWER
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(session))
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.cues()).toEqual([])
		expect(store.selectedCues()).toEqual([])
		expect(store.triadsStep()).toBe('FINAL')
		expect(store.gamePlayState()).toBe(GamePlayState.PLAYING)
	})

	it('finalizes a loss interrupted before its result was recorded', () => {
		const store = TestBed.inject(GlobalStore)
		const session = savedSessionWith(TODAY)
		session.gamePlayState = GamePlayState.WRONG_TRIAD
		session.turns.forEach((t) => (t.available = false))
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(session))
		store.setGameMode('daily')
		component.ngOnInit()
		expect(TestBed.inject(GamePlayLogic).handleGameLost).toHaveBeenCalledTimes(1)
	})

	it('ignores a malformed local snapshot and loads a playable board', () => {
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify({ puzzleDate: TODAY, triadGroupId: 42 }))
		const store = TestBed.inject(GlobalStore)
		store.setGameMode('daily')
		expect(() => component.ngOnInit()).not.toThrow()
		expect(store.solvedTriads()).toEqual([])
		expect(store.cues()?.length).toBe(6)
	})

	it('keeps newer local progress when the last server save predates a solve', () => {
		const local = savedSessionWith(TODAY)
		local.savedAt = 200
		const server = savedSessionWith(TODAY)
		server.savedAt = 100
		server.solvedTriads = []
		const api = TestBed.inject(GamePlayApi)
		;(api.getDailyCues as jasmine.Spy).and.returnValue(of({ ...inProgressResponse, progress: server }))
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(local))
		const store = TestBed.inject(GlobalStore)
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.solvedTriads().length).toBe(2)
		expect(api.putDailyProgress).toHaveBeenCalled()
	})

	it('restores server progress when local storage is missing', () => {
		const api = TestBed.inject(GamePlayApi)
		;(api.getDailyCues as jasmine.Spy).and.returnValue(of({ ...inProgressResponse, progress: savedSessionWith(TODAY) }))
		const store = TestBed.inject(GlobalStore)
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.solvedTriads().length).toBe(2)
	})

	it('retries an unsaved terminal result without incrementing local statistics again', () => {
		const session = savedSessionWith(TODAY)
		session.gamePlayState = GamePlayState.LOST
		session.gameScore = 6
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(session))
		const store = TestBed.inject(GlobalStore)
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.gamePlayState()).toBe(GamePlayState.LOST)
		expect(TestBed.inject(GamePlayApi).postDailyComplete).toHaveBeenCalledOnceWith('lost', 6)
		expect(TestBed.inject(GamePlayLogic).handleGameLost).not.toHaveBeenCalled()
	})
	it('clears solved-triad hints when reload advances to the remaining triad', () => {
		const session = {
			...savedSessionWith(TODAY),
			cues: ['SECOND', 'POKER', 'SHAKE', 'FILM', 'SEA', 'SUPER'],
			selectedCues: ['SECOND', 'POKER', 'SHAKE'],
			gamePlayState: GamePlayState.CORRECT_ANSWER,
			keywordLengthHint: 4,
			firstLetterHint: 'H',
			hintUsed: true,
		}
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(session))
		const store = TestBed.inject(GlobalStore)
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.selectedCues()).toEqual(['FILM', 'SEA', 'SUPER'])
		expect(store.keywordLengthHint()).toBeNull()
		expect(store.firstLetterHint()).toBeNull()
		expect(store.hintUsed()).toBeFalse()
	})

	it('does not remove an unsolved cue with the opposite hyphen direction during reload', () => {
		const session = {
			...savedSessionWith(TODAY),
			cues: ['PUSH-', '-PUSH', 'AIR', 'WINE'],
			selectedCues: [],
			gamePlayState: GamePlayState.CORRECT_ANSWER,
			solvedTriads: [{ id: 1, keyword: 'BUTTON', cues: ['PUSH-', 'CAMPAIGN', 'PANIC'], fullPhrases: [] }],
		}
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify(session))
		const store = TestBed.inject(GlobalStore)
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.cues()).toEqual(['-PUSH', 'AIR', 'WINE'])
	})
	it('prefers server progress over a timestamp-free legacy local snapshot', () => {
		const local = savedSessionWith(TODAY)
		local.solvedTriads = []
		const server = savedSessionWith(TODAY)
		const api = TestBed.inject(GamePlayApi)
		;(api.getDailyCues as jasmine.Spy).and.returnValue(of({ ...inProgressResponse, progress: { ...server, savedAt: undefined } }))
		localStorage.setItem(DAILY_GAME_SESSION_STORAGE_KEY, JSON.stringify({ ...local, savedAt: undefined }))
		const store = TestBed.inject(GlobalStore)
		store.setGameMode('daily')
		component.ngOnInit()
		expect(store.solvedTriads().length).toBe(2)
	})
})

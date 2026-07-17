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
		puzzleDate,
		triadGroupId: 42,
		cues: ['SECOND', 'POKER', 'SHAKE', 'DEAD', 'LAND', 'PIPE'],
		finalTriadCues: null,
		selectedCues: [],
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
				{ provide: GamePlayLogic, useValue: { resetAnswerFieldState: jasmine.createSpy('resetAnswerFieldState') } },
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
		expect(store.gamePlayState()).toBe(GamePlayState.PLAYING)
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
})

import { ComponentFixture, TestBed } from '@angular/core/testing'
import { NavigationEnd, Router } from '@angular/router'
import { of, Subject } from 'rxjs'

import { AssetPreloadService } from '../../shared/services/asset-preload.service'
import { DailyPostPlayService } from '../../shared/services/daily-post-play.service'
import { DailyRolloverService } from '../../shared/services/daily-rollover.service'
import { SnackbarService } from '../../shared/services/snackbar.service'
import { DailyReviewSummary } from '../game-play/interfaces/daily-review.interface'
import { GamePlayApi } from '../game-play/services/game-play-api'
import { HomePage } from './home.page'

describe('HomePage', () => {
	let component: HomePage
	let fixture: ComponentFixture<HomePage>
	let routerEvents$: Subject<NavigationEnd>
	let dailyPostPlayService: jasmine.SpyObj<DailyPostPlayService>
	let reentryRollover: (() => void) | undefined

	const completedSummary: DailyReviewSummary = {
		result: 'LOST',
		score: 8,
		puzzleDate: '2026-04-20',
		nextPuzzleAt: '2026-04-21T05:00:00.000Z',
		triads: [{ id: 1, keyword: 'HAND', cues: ['SECOND', 'POKER', 'SHAKE'], fullPhrases: ['SECONDHAND', 'POKER HAND', 'HANDSHAKE'] }],
	}

	beforeEach(async () => {
		routerEvents$ = new Subject<NavigationEnd>()
		reentryRollover = undefined
		dailyPostPlayService = jasmine.createSpyObj<DailyPostPlayService>('DailyPostPlayService', ['loadCompletedDailySummary', 'shareScoreImage'])
		dailyPostPlayService.loadCompletedDailySummary.and.resolveTo(completedSummary)
		dailyPostPlayService.shareScoreImage.and.resolveTo()

		await TestBed.configureTestingModule({
			imports: [HomePage],
			providers: [
				{
					provide: GamePlayApi,
					useValue: {
						getDailyTodayInfo: () =>
							of({ scheduled: true, puzzleDate: '2026-04-20', triadGroupId: 42, challengeNumber: 1, hasCompletedDaily: true }),
					},
				},
				{
					provide: Router,
					useValue: {
						events: routerEvents$,
						navigate: jasmine.createSpy('navigate'),
					},
				},
				{
					provide: AssetPreloadService,
					useValue: {
						imageVersion: () => 0,
						getImageUrl: (path: string) => path,
					},
				},
				{
					provide: DailyPostPlayService,
					useValue: dailyPostPlayService,
				},
				{
					// Captures the re-entry handler so a test can simulate returning after a rollover.
					provide: DailyRolloverService,
					useValue: {
						easternCalendarLabel: () => ({ month: 'JUN', day: '16' }),
						startEasternDayWatcher: (handlers: { onReentryRollover?: () => void }) => {
							reentryRollover = handlers.onReentryRollover
							return jasmine.createSpy('stopEasternDayWatcher')
						},
					},
				},
				{
					provide: SnackbarService,
					useValue: jasmine.createSpyObj<SnackbarService>('SnackbarService', ['showSnackbar']),
				},
			],
		}).compileComponents()

		fixture = TestBed.createComponent(HomePage)
		component = fixture.componentInstance
		component.store.setUser({
			username: 'TestPlayer01',
			scores: { 15: 0, 12: 0, 10: 0, 8: 0, 6: 0, 3: 0, 0: 0 },
			firstGameDate: null,
		})
		fixture.detectChanges()
		await fixture.whenStable()
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	it('renders half-width share and review actions for completed daily players', () => {
		const buttons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
		const shareButton = buttons.find((button) => button.getAttribute('aria-label') === 'Share daily result')
		const reviewButton = buttons.find((button) => button.getAttribute('aria-label') === 'Review daily result')
		const disabledDailyButton = buttons.find((button) => button.textContent?.includes('Daily Puzzle'))

		expect(shareButton).toBeTruthy()
		expect(reviewButton).toBeTruthy()
		expect(disabledDailyButton).toBeFalsy()
		expect(shareButton?.disabled).toBeFalse()
		expect(reviewButton?.disabled).toBeFalse()
		expect(shareButton?.classList.contains('flex-1')).toBeTrue()
		expect(reviewButton?.classList.contains('flex-1')).toBeTrue()
		expect(shareButton?.textContent).toContain('Share')
		expect(reviewButton?.textContent).toContain('Review')
	})

	it('opens the review dialog from the home page', async () => {
		await component.onReviewCompletedDaily()
		fixture.detectChanges()

		expect(component.reviewDialogOpen()).toBeTrue()
	})

	it('shares the completed daily result synchronously to preserve Safari user activation', () => {
		component.onShareCompletedDaily()

		expect(dailyPostPlayService.shareScoreImage).toHaveBeenCalledWith(8, '2026-04-20')
	})

	it('does not share before the completed daily summary is available', () => {
		component.completedDailySummary.set(null)

		component.onShareCompletedDaily()

		expect(dailyPostPlayService.shareScoreImage).not.toHaveBeenCalled()
		expect(dailyPostPlayService.loadCompletedDailySummary).toHaveBeenCalled()
	})

	// ADR-0002: stale post-Daily popups must not linger over a refreshed home view after a rollover.
	it('dismisses open Play-More and Review popups on a rollover re-entry', () => {
		component.playMoreDialogOpen.set(true)
		component.reviewDialogOpen.set(true)

		reentryRollover?.()

		expect(component.playMoreDialogOpen()).toBeFalse()
		expect(component.reviewDialogOpen()).toBeFalse()
	})
})

// Trello KxOrLjJv: the next-day Welcome must render even when yesterday's session ended with the
// Daily completed and one or more bonus games played — the backend's today-scoped response is the
// only source of truth, the home page must not retain yesterday's "Daily Completed" state.
describe('HomePage — next-day fresh state', () => {
	let component: HomePage
	let fixture: ComponentFixture<HomePage>
	let routerEvents$: Subject<NavigationEnd>
	let getDailyTodayInfo: jasmine.Spy
	let reentryRollover: (() => void) | undefined
	let timerRollover: (() => void) | undefined

	const freshTodayResponse = {
		scheduled: true as const,
		puzzleDate: '2026-06-17',
		triadGroupId: 42,
		challengeNumber: 1,
		hasCompletedDaily: false,
		classicExtrasUsed: 0,
		classicExtrasRemaining: 3,
		classicExtrasLimit: 3,
		canPlayClassic: false,
		classicBlockedReason: 'daily_required' as const,
	}

	const yesterdayCompletedResponse = {
		scheduled: true as const,
		puzzleDate: '2026-06-16',
		triadGroupId: 41,
		challengeNumber: 0,
		hasCompletedDaily: true,
		classicExtrasUsed: 1,
		classicExtrasRemaining: 2,
		classicExtrasLimit: 3,
		canPlayClassic: true,
		classicBlockedReason: null,
	}

	beforeEach(async () => {
		routerEvents$ = new Subject<NavigationEnd>()
		reentryRollover = undefined
		timerRollover = undefined
		getDailyTodayInfo = jasmine.createSpy('getDailyTodayInfo').and.returnValue(of(freshTodayResponse))

		const dailyPostPlayService = jasmine.createSpyObj<DailyPostPlayService>('DailyPostPlayService', ['loadCompletedDailySummary', 'shareScoreImage'])

		await TestBed.configureTestingModule({
			imports: [HomePage],
			providers: [
				{ provide: GamePlayApi, useValue: { getDailyTodayInfo } },
				{ provide: Router, useValue: { events: routerEvents$, navigate: jasmine.createSpy('navigate') } },
				{ provide: AssetPreloadService, useValue: { imageVersion: () => 0, getImageUrl: (path: string) => path } },
				{ provide: DailyPostPlayService, useValue: dailyPostPlayService },
				{
					provide: DailyRolloverService,
					useValue: {
						easternCalendarLabel: () => ({ month: 'JUN', day: '17' }),
						startEasternDayWatcher: (handlers: { onTimerRollover?: () => void; onReentryRollover?: () => void }) => {
							timerRollover = handlers.onTimerRollover
							reentryRollover = handlers.onReentryRollover
							return jasmine.createSpy('stopEasternDayWatcher')
						},
					},
				},
				{ provide: SnackbarService, useValue: jasmine.createSpyObj<SnackbarService>('SnackbarService', ['showSnackbar']) },
			],
		}).compileComponents()

		fixture = TestBed.createComponent(HomePage)
		component = fixture.componentInstance
		component.store.setUser({
			username: 'TestPlayer01',
			scores: { 15: 0, 12: 0, 10: 0, 8: 0, 6: 0, 3: 0, 0: 0 },
			firstGameDate: null,
		})
	})

	function detectChangesAndSettle() {
		fixture.detectChanges()
	}

	it('renders the Welcome play-now button on day N+1 when today has no attempt yet', () => {
		detectChangesAndSettle()

		expect(component.dailyScheduled()).toBeTrue()
		expect(component.dailyCompleted()).toBeFalse()

		const playNowButton = fixture.nativeElement.querySelector('app-brain-warming-play-button') as HTMLElement | null
		expect(playNowButton).toBeTruthy()

		const playMoreButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((btn) =>
			(btn as HTMLButtonElement).textContent?.includes('Play More'),
		)
		expect(playMoreButton).toBeFalsy()
	})

	it('refreshes from yesterday-completed to today-Welcome on a timer rollover', () => {
		getDailyTodayInfo.and.returnValue(of(yesterdayCompletedResponse))
		detectChangesAndSettle()
		expect(component.dailyCompleted()).toBeTrue()

		getDailyTodayInfo.and.returnValue(of(freshTodayResponse))
		timerRollover?.()
		detectChangesAndSettle()

		expect(component.dailyCompleted()).toBeFalse()
	})

	it('refreshes from yesterday-completed to today-Welcome on a re-entry rollover', () => {
		getDailyTodayInfo.and.returnValue(of(yesterdayCompletedResponse))
		detectChangesAndSettle()
		expect(component.dailyCompleted()).toBeTrue()

		getDailyTodayInfo.and.returnValue(of(freshTodayResponse))
		reentryRollover?.()
		detectChangesAndSettle()

		expect(component.dailyCompleted()).toBeFalse()
	})
})

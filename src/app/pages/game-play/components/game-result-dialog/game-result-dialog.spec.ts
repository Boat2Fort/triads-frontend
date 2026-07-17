import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'

import { AssetPreloadService } from '../../../../shared/services/asset-preload.service'
import { DailyPostPlayService } from '../../../../shared/services/daily-post-play.service'
import { PlayRouteIntentService } from '../../../../shared/services/play-route-intent.service'
import { SnackbarService } from '../../../../shared/services/snackbar.service'
import { GlobalStore } from '../../../../state/global.store'
import { getScoreGifPath } from '../../constants/share.constant'
import { GameResultDialog } from './game-result-dialog'

describe('GameResultDialog', () => {
	let component: GameResultDialog
	let fixture: ComponentFixture<GameResultDialog>
	let mockStore: {
		gameMode: jasmine.Spy
		unsolvedTriads: jasmine.Spy
		gameScore: jasmine.Spy
		solvedTriads: jasmine.Spy
		dailyNextPuzzleAt: jasmine.Spy
		dailyPuzzleDate: jasmine.Spy
		dailyReviewTriads: jasmine.Spy
		triadGroupId: jasmine.Spy
		setDailyReviewTriads: jasmine.Spy
		setUnsolvedTriads: jasmine.Spy
		resetGameState: jasmine.Spy
		setGameMode: jasmine.Spy
		classicExtraQuota: jasmine.Spy
		isFinalClassicExtraSession: jasmine.Spy
	}
	let dailyPostPlayService: jasmine.SpyObj<DailyPostPlayService>
	let router: jasmine.SpyObj<Router>
	let playRouteIntent: jasmine.SpyObj<PlayRouteIntentService>

	beforeEach(async () => {
		mockStore = {
			gameMode: jasmine.createSpy('gameMode').and.returnValue('daily'),
			unsolvedTriads: jasmine.createSpy('unsolvedTriads').and.returnValue(null),
			gameScore: jasmine.createSpy('gameScore').and.returnValue(10),
			solvedTriads: jasmine.createSpy('solvedTriads').and.returnValue([]),
			dailyNextPuzzleAt: jasmine.createSpy('dailyNextPuzzleAt').and.returnValue('2026-04-21T05:00:00.000Z'),
			dailyPuzzleDate: jasmine.createSpy('dailyPuzzleDate').and.returnValue('2026-04-20'),
			dailyReviewTriads: jasmine.createSpy('dailyReviewTriads').and.returnValue([
				{ id: 1, keyword: 'HAND', cues: ['SECOND', 'POKER', 'SHAKE'], fullPhrases: ['SECONDHAND', 'POKER HAND', 'HANDSHAKE'] },
				{ id: 2, keyword: 'LINE', cues: ['DEAD', 'LAND', 'PIPE'], fullPhrases: ['DEADLINE', 'LANDLINE', 'PIPELINE'] },
				{ id: 3, keyword: 'STAR', cues: ['FILM', 'SEA', 'SUPER'], fullPhrases: ['FILM STAR', 'STARFISH', 'SUPERSTAR'] },
				{ id: 4, keyword: 'LIGHT', cues: ['DAY', 'MOON', 'SPOT'], fullPhrases: ['DAYLIGHT', 'MOONLIGHT', 'SPOTLIGHT'] },
			]),
			triadGroupId: jasmine.createSpy('triadGroupId').and.returnValue(42),
			setDailyReviewTriads: jasmine.createSpy('setDailyReviewTriads'),
			setUnsolvedTriads: jasmine.createSpy('setUnsolvedTriads'),
			resetGameState: jasmine.createSpy('resetGameState'),
			setGameMode: jasmine.createSpy('setGameMode'),
			classicExtraQuota: jasmine.createSpy('classicExtraQuota').and.returnValue({
				classicExtrasUsed: 0,
				classicExtrasRemaining: 3,
				classicExtrasLimit: 3,
				canPlayClassic: true,
				classicBlockedReason: null,
			}),
			isFinalClassicExtraSession: jasmine.createSpy('isFinalClassicExtraSession').and.returnValue(false),
		}
		router = jasmine.createSpyObj<Router>('Router', ['navigate'])
		router.navigate.and.resolveTo(true)
		playRouteIntent = jasmine.createSpyObj<PlayRouteIntentService>('PlayRouteIntentService', ['markPending'])
		dailyPostPlayService = jasmine.createSpyObj<DailyPostPlayService>('DailyPostPlayService', [
			'shareScoreImage',
			'createReviewSummary',
			'hasCompleteReviewTriads',
			'mergeReviewTriads',
			'loadReviewTriads',
		])
		dailyPostPlayService.createReviewSummary.and.callFake((summary) => summary)
		dailyPostPlayService.hasCompleteReviewTriads.and.callFake(
			(triads: ReturnType<typeof mockStore.dailyReviewTriads>): triads is NonNullable<ReturnType<typeof mockStore.dailyReviewTriads>> =>
				Array.isArray(triads) && triads.length === 4,
		)
		dailyPostPlayService.mergeReviewTriads.and.callFake((solvedTriads, unsolvedTriads) => [...solvedTriads, ...(unsolvedTriads ?? [])])
		dailyPostPlayService.shareScoreImage.and.resolveTo()
		dailyPostPlayService.loadReviewTriads.and.resolveTo([
			{ id: 1, keyword: 'HAND', cues: ['SECOND', 'POKER', 'SHAKE'], fullPhrases: ['SECONDHAND', 'POKER HAND', 'HANDSHAKE'] },
			{ id: 2, keyword: 'LINE', cues: ['DEAD', 'LAND', 'PIPE'], fullPhrases: ['DEADLINE', 'LANDLINE', 'PIPELINE'] },
			{ id: 3, keyword: 'STAR', cues: ['FILM', 'SEA', 'SUPER'], fullPhrases: ['FILM STAR', 'STARFISH', 'SUPERSTAR'] },
			{ id: 4, keyword: 'LIGHT', cues: ['DAY', 'MOON', 'SPOT'], fullPhrases: ['DAYLIGHT', 'MOONLIGHT', 'SPOTLIGHT'] },
		])

		await TestBed.configureTestingModule({
			imports: [GameResultDialog],
			providers: [
				{
					provide: GlobalStore,
					useValue: mockStore,
				},
				{
					provide: DailyPostPlayService,
					useValue: dailyPostPlayService,
				},
				{
					provide: AssetPreloadService,
					useValue: {
						imageVersion: () => 0,
						getImageUrl: (path: string) => path,
						playSound: jasmine.createSpy('playSound'),
					},
				},
				{
					provide: SnackbarService,
					useValue: jasmine.createSpyObj<SnackbarService>('SnackbarService', ['showSnackbar']),
				},
				{
					provide: Router,
					useValue: router,
				},
				{
					provide: PlayRouteIntentService,
					useValue: playRouteIntent,
				},
			],
		}).compileComponents()

		fixture = TestBed.createComponent(GameResultDialog)
		component = fixture.componentInstance
		fixture.componentRef.setInput('result', 'WON')
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	it('plays celebration sound on daily win with perfect score', () => {
		const playSoundSpy = TestBed.inject(AssetPreloadService).playSound as jasmine.Spy
		playSoundSpy.calls.reset()
		mockStore.gameScore.and.returnValue(15)

		fixture = TestBed.createComponent(GameResultDialog)
		fixture.componentRef.setInput('result', 'WON')
		fixture.detectChanges()

		expect(playSoundSpy).toHaveBeenCalledWith('sounds/ta-dah.mp3', { volume: 0.7 })
	})

	it('renders score-specific GIF in result dialog', () => {
		const renderedImage = fixture.nativeElement.querySelector('img')

		expect(renderedImage).toBeTruthy()
		expect(renderedImage.getAttribute('src')).toBe(getScoreGifPath(10))
		expect(renderedImage.getAttribute('alt')).toContain('score 10')
	})

	it('shares the current score synchronously to preserve Safari user activation', () => {
		component.shareGameResult()

		expect(dailyPostPlayService.shareScoreImage).toHaveBeenCalledWith(10, '2026-04-20')
	})

	it('opens play more dialog when continuing from daily result', () => {
		component.openPlayMoreDialog()

		expect(component.playMoreDialogOpen()).toBeTrue()
	})

	it('opens the review dialog immediately when daily review data is already available', async () => {
		await component.openDailyReview()

		expect(component.reviewDialogOpen()).toBeTrue()
		expect(dailyPostPlayService.loadReviewTriads).not.toHaveBeenCalled()
	})

	it('loads review data before opening when daily triads are not cached yet', async () => {
		mockStore.dailyReviewTriads.and.returnValue(null)
		mockStore.solvedTriads.and.returnValue([])
		mockStore.unsolvedTriads.and.returnValue(null)
		fixture = TestBed.createComponent(GameResultDialog)
		component = fixture.componentInstance
		fixture.componentRef.setInput('result', 'WON')
		fixture.detectChanges()

		await component.openDailyReview()

		expect(dailyPostPlayService.loadReviewTriads).toHaveBeenCalledWith(42)
		expect(mockStore.setDailyReviewTriads).toHaveBeenCalled()
		expect(component.reviewDialogOpen()).toBeTrue()
	})

	it('shows final classic layout without Play Again', () => {
		mockStore.gameMode.and.returnValue('classic')
		mockStore.isFinalClassicExtraSession.and.returnValue(true)
		mockStore.classicExtraQuota.and.returnValue({
			classicExtrasUsed: 3,
			classicExtrasRemaining: 0,
			classicExtrasLimit: 3,
			canPlayClassic: false,
			classicBlockedReason: 'capacity_reached',
		})
		fixture = TestBed.createComponent(GameResultDialog)
		component = fixture.componentInstance
		fixture.componentRef.setInput('result', 'WON')
		fixture.detectChanges()

		const playAgainButton = fixture.nativeElement.querySelector('button.btn.hover\\:bg-success')
		const reviewButton = fixture.nativeElement.querySelector('button.btn.hover\\:bg-info')
		const caption = fixture.nativeElement.textContent

		expect(playAgainButton).toBeFalsy()
		expect(reviewButton).toBeTruthy()
		expect(caption).toContain('See you tomorrow!')
		expect(caption).toContain("You've played all 3 bonus games today")
	})

	it('fetches the full review set when the current game only has partial triads', async () => {
		mockStore.dailyReviewTriads.and.returnValue(null)
		mockStore.solvedTriads.and.returnValue([
			{ id: 1, keyword: 'HAND', cues: ['SECOND', 'POKER', 'SHAKE'], fullPhrases: ['SECONDHAND', 'POKER HAND', 'HANDSHAKE'] },
			{ id: 2, keyword: 'LINE', cues: ['DEAD', 'LAND', 'PIPE'], fullPhrases: ['DEADLINE', 'LANDLINE', 'PIPELINE'] },
		])
		mockStore.unsolvedTriads.and.returnValue([
			{ id: 3, keyword: 'STAR', cues: ['FILM', 'SEA', 'SUPER'], fullPhrases: ['FILM STAR', 'STARFISH', 'SUPERSTAR'] },
		])
		fixture = TestBed.createComponent(GameResultDialog)
		component = fixture.componentInstance
		fixture.componentRef.setInput('result', 'LOST')
		fixture.detectChanges()

		await component.openDailyReview()

		expect(dailyPostPlayService.loadReviewTriads).toHaveBeenCalledWith(42)
		expect(mockStore.setDailyReviewTriads).toHaveBeenCalled()
		expect(component.reviewDialogOpen()).toBeTrue()
	})
})

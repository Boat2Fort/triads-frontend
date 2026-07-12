import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'

import { User } from '../../../shared/interfaces/user.interface'
import { UserService } from '../../../shared/services/user.service'
import { GlobalStore } from '../../../state/global.store'
import { GamePlayState } from '../enums/game-play.enum'
import { GamePlayApi } from './game-play-api'
import { GamePlayLogic } from './game-play-logic'
import { TurnHintService } from './turn-hint.service'

describe('GamePlayLogic', () => {
	let service: GamePlayLogic
	let mockStore: {
		gameMode: jasmine.Spy
		user: jasmine.Spy
		turns: jasmine.Spy
		hints: jasmine.Spy
		cues: jasmine.Spy
		finalTriadCues: jasmine.Spy
		setGameScore: jasmine.Spy
		setGamePlayState: jasmine.Spy
		setUser: jasmine.Spy
		setDailyNextPuzzleAt: jasmine.Spy
		setClassicExtraQuota: jasmine.Spy
		triadGroupId: jasmine.Spy
	}
	let userService: jasmine.SpyObj<UserService>
	let gamePlayApi: jasmine.SpyObj<GamePlayApi>
	let turnHintService: jasmine.SpyObj<TurnHintService>

	const baseUser: User = {
		username: 'TestUser',
		scores: { 15: 0, 12: 0, 10: 0, 8: 0, 6: 0, 3: 0, 0: 0 },
		firstGameDate: null,
	}

	beforeEach(() => {
		mockStore = {
			gameMode: jasmine.createSpy('gameMode').and.returnValue('daily'),
			user: jasmine.createSpy('user').and.returnValue(baseUser),
			turns: jasmine.createSpy('turns').and.returnValue([]),
			hints: jasmine.createSpy('hints').and.returnValue([]),
			cues: jasmine.createSpy('cues').and.returnValue([]),
			finalTriadCues: jasmine.createSpy('finalTriadCues').and.returnValue(null),
			setGameScore: jasmine.createSpy('setGameScore'),
			setGamePlayState: jasmine.createSpy('setGamePlayState'),
			setUser: jasmine.createSpy('setUser'),
			setDailyNextPuzzleAt: jasmine.createSpy('setDailyNextPuzzleAt'),
			setClassicExtraQuota: jasmine.createSpy('setClassicExtraQuota'),
			triadGroupId: jasmine.createSpy('triadGroupId').and.returnValue(null),
		}
		userService = jasmine.createSpyObj<UserService>('UserService', ['setUser'])
		gamePlayApi = jasmine.createSpyObj<GamePlayApi>('GamePlayApi', ['postDailyComplete', 'getDailyTodayInfo'])
		gamePlayApi.postDailyComplete.and.returnValue(of({ ok: true as const, puzzleDate: '2026-05-28', nextPuzzleAt: '2026-05-29T09:00:00.000Z' }))
		gamePlayApi.getDailyTodayInfo.and.returnValue(
			of({
				scheduled: false,
				puzzleDate: '2026-05-28',
			}),
		)
		turnHintService = jasmine.createSpyObj<TurnHintService>('TurnHintService', ['numberOfAvailableTurns', 'numberOfAvailableHints'])
		turnHintService.numberOfAvailableTurns.and.returnValue(3)
		turnHintService.numberOfAvailableHints.and.returnValue(2)

		TestBed.configureTestingModule({
			providers: [
				GamePlayLogic,
				{ provide: GlobalStore, useValue: mockStore },
				{ provide: UserService, useValue: userService },
				{ provide: GamePlayApi, useValue: gamePlayApi },
				{ provide: TurnHintService, useValue: turnHintService },
			],
		})

		service = TestBed.inject(GamePlayLogic)
	})

	it('should be created', () => {
		expect(service).toBeTruthy()
	})

	it('records daily game results in user stats', () => {
		service.handleGameWon()

		expect(mockStore.setGameScore).toHaveBeenCalledWith(15)
		expect(mockStore.setGamePlayState).toHaveBeenCalledWith(GamePlayState.WON)
		expect(mockStore.setUser).toHaveBeenCalledWith(
			jasmine.objectContaining({
				scores: jasmine.objectContaining({ 15: 1 }),
				firstGameDate: jasmine.any(String),
			}),
		)
		expect(userService.setUser).toHaveBeenCalled()
		expect(gamePlayApi.postDailyComplete).toHaveBeenCalledWith('won', 15)
	})

	it('does not record classic game results in user stats', () => {
		mockStore.gameMode.and.returnValue('classic')

		service.handleGameWon()

		expect(mockStore.setGameScore).toHaveBeenCalledWith(15)
		expect(mockStore.setGamePlayState).toHaveBeenCalledWith(GamePlayState.WON)
		expect(mockStore.setUser).not.toHaveBeenCalled()
		expect(userService.setUser).not.toHaveBeenCalled()
		expect(gamePlayApi.postDailyComplete).not.toHaveBeenCalled()
	})

	it('records standalone Classic results in local stats', () => {
		mockStore.gameMode.and.returnValue('standalone-classic')

		service.handleGameWon()

		expect(mockStore.setUser).toHaveBeenCalledWith(
			jasmine.objectContaining({
				scores: jasmine.objectContaining({ 15: 1 }),
			}),
		)
		expect(userService.setUser).toHaveBeenCalled()
		expect(gamePlayApi.postDailyComplete).not.toHaveBeenCalled()
	})

	it('records daily losses in user stats', () => {
		turnHintService.numberOfAvailableTurns.and.returnValue(0)
		turnHintService.numberOfAvailableHints.and.returnValue(2)
		mockStore.cues.and.returnValue(['A', 'B', 'C', 'D', 'E', 'F'])

		service.handleGameLost()

		expect(mockStore.setGameScore).toHaveBeenCalledWith(3)
		expect(mockStore.setGamePlayState).toHaveBeenCalledWith(GamePlayState.LOST)
		expect(mockStore.setUser).toHaveBeenCalledWith(
			jasmine.objectContaining({
				scores: jasmine.objectContaining({ 3: 1 }),
			}),
		)
		expect(gamePlayApi.postDailyComplete).toHaveBeenCalledWith('lost', 3)
	})

	it('does not record classic losses in user stats', () => {
		mockStore.gameMode.and.returnValue('classic')
		turnHintService.numberOfAvailableTurns.and.returnValue(0)
		turnHintService.numberOfAvailableHints.and.returnValue(2)
		mockStore.cues.and.returnValue(['A', 'B', 'C', 'D', 'E', 'F'])

		service.handleGameLost()

		expect(mockStore.setGameScore).toHaveBeenCalledWith(3)
		expect(mockStore.setGamePlayState).toHaveBeenCalledWith(GamePlayState.LOST)
		expect(mockStore.setUser).not.toHaveBeenCalled()
		expect(userService.setUser).not.toHaveBeenCalled()
		expect(gamePlayApi.postDailyComplete).not.toHaveBeenCalled()
	})
})

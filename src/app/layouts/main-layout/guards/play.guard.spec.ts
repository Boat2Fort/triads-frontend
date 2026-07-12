import { TestBed } from '@angular/core/testing'
import { ActivatedRouteSnapshot, RedirectCommand, Router } from '@angular/router'
import { firstValueFrom, of } from 'rxjs'

import { GamePlayApi } from '../../../pages/game-play/services/game-play-api'
import { PlayRouteIntentService } from '../../../shared/services/play-route-intent.service'
import { UserService } from '../../../shared/services/user.service'
import { GlobalStore } from '../../../state/global.store'
import { playGuard } from './play.guard'

describe('playGuard', () => {
	const mockUser = { username: 'test', scores: {} }

	const runGuard = async (mode: 'classic' | 'daily' | 'standalone-classic', options?: { canPlayClassic?: boolean; hasCompletedDaily?: boolean }) => {
		const route = {
			data: { mode },
		} as unknown as ActivatedRouteSnapshot

		const gamePlayApi = {
			getDailyTodayInfo: jasmine.createSpy('getDailyTodayInfo').and.returnValue(
				of({
					scheduled: true,
					puzzleDate: '2026-05-26',
					triadGroupId: 1,
					challengeNumber: 1,
					hasCompletedDaily: options?.hasCompletedDaily ?? false,
					classicExtrasUsed: 0,
					classicExtrasRemaining: 3,
					classicExtrasLimit: 3,
					canPlayClassic: options?.canPlayClassic ?? true,
					classicBlockedReason: options?.canPlayClassic === false ? 'daily_required' : null,
				}),
			),
		}

		const store = {
			setGameMode: jasmine.createSpy('setGameMode'),
			setClassicExtraQuota: jasmine.createSpy('setClassicExtraQuota'),
		}

		TestBed.configureTestingModule({
			providers: [
				{ provide: Router, useValue: { parseUrl: (url: string) => url } },
				{ provide: GamePlayApi, useValue: gamePlayApi },
				{ provide: UserService, useValue: { getUser: () => mockUser } },
				{ provide: PlayRouteIntentService, useValue: { consumePending: () => true } },
				{ provide: GlobalStore, useValue: store },
			],
		})

		const guardResult = TestBed.runInInjectionContext(() => playGuard(route, {} as never))
		const result = typeof guardResult === 'object' && guardResult !== null && 'subscribe' in guardResult ? await firstValueFrom(guardResult) : guardResult
		return { result, gamePlayApi, store }
	}

	it('redirects classic play when daily gate blocks access', async () => {
		const { result } = await runGuard('classic', { canPlayClassic: false })

		expect(result).toBeInstanceOf(RedirectCommand)
	})

	it('allows classic play when quota is available', async () => {
		const { result } = await runGuard('classic', { canPlayClassic: true })

		expect(result).toBeTrue()
	})

	it('allows standalone Classic without checking the Daily quota', async () => {
		const { result, gamePlayApi } = await runGuard('standalone-classic')

		expect(result).toBeTrue()
		expect(gamePlayApi.getDailyTodayInfo).not.toHaveBeenCalled()
	})

	it('redirects daily play when already completed', async () => {
		const { result } = await runGuard('daily', { hasCompletedDaily: true })

		expect(result).toBeInstanceOf(RedirectCommand)
	})
})

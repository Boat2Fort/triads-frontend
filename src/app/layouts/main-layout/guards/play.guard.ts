import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn, RedirectCommand, Router } from '@angular/router'
import { catchError, map, of } from 'rxjs'

import { GamePlayApi } from '../../../pages/game-play/services/game-play-api'
import { PlayRouteIntentService } from '../../../shared/services/play-route-intent.service'
import { UserService } from '../../../shared/services/user.service'
import { extractClassicExtraQuota } from '../../../shared/utils/classic-extra.util'
import { GlobalStore } from '../../../state/global.store'

type PlayMode = 'classic' | 'daily' | 'standalone-classic'

function readModeFromRoute(route: ActivatedRouteSnapshot): PlayMode {
	const mode = route.data['mode']
	return mode === 'daily' || mode === 'standalone-classic' ? mode : 'classic'
}

function redirectToHome(router: Router): RedirectCommand {
	return new RedirectCommand(router.parseUrl('/'), {
		replaceUrl: true,
		onSameUrlNavigation: 'ignore',
	})
}

export const playGuard: CanActivateFn = (route) => {
	const store = inject(GlobalStore)
	const router = inject(Router)
	const gamePlayApi = inject(GamePlayApi)
	const userService = inject(UserService)
	const playRouteIntent = inject(PlayRouteIntentService)

	const mode = readModeFromRoute(route)
	store.setGameMode(mode)

	if (!userService.getUser()) {
		return redirectToHome(router)
	}

	if (!playRouteIntent.consumePending()) {
		return redirectToHome(router)
	}

	if (mode === 'standalone-classic') {
		return true
	}

	if (mode !== 'daily') {
		return gamePlayApi.getDailyTodayInfo().pipe(
			map((info) => {
				const quota = extractClassicExtraQuota(info)
				if (quota) {
					store.setClassicExtraQuota(quota)
				}
				if (quota?.canPlayClassic === false) {
					return redirectToHome(router)
				}
				return true
			}),
			catchError(() => of(true)),
		)
	}

	return gamePlayApi.getDailyTodayInfo().pipe(
		map((info) => {
			if (info.scheduled && info.hasCompletedDaily === true) {
				return redirectToHome(router)
			}
			return true
		}),
		catchError(() => of(true)),
	)
}

import { inject, Injectable } from '@angular/core'
import { Observable, shareReplay, Subscription } from 'rxjs'

import { DailyCuesResponse, GamePlayApi } from '../../pages/game-play/services/game-play-api'
import { GlobalStore } from '../../state/global.store'
import { Difficulty } from '../enums/difficulty.enum'
import { DifficultyService } from './difficulty.service'

export interface ClassicCuesResponse {
	triadGroupId: string | number | null
	cues: string[] | null
	message?: string
}

@Injectable({
	providedIn: 'root',
})
export class GameCuePrefetchService {
	private readonly gamePlayApi = inject(GamePlayApi)

	private readonly difficultyService = inject(DifficultyService)

	private readonly store = inject(GlobalStore)

	private dailyCues$: Observable<DailyCuesResponse> | null = null

	private classicPrefetch: { difficulty: Difficulty; stream: Observable<ClassicCuesResponse> } | null = null

	private prefetchSubscription: Subscription | null = null

	/** Starts fetching cues during the brain-warming animation so the play route can render faster. */
	startPrefetch(): void {
		this.clear()

		if (this.store.gameMode() === 'daily') {
			const stream = this.gamePlayApi.getDailyCues().pipe(shareReplay({ bufferSize: 1, refCount: false }))
			this.dailyCues$ = stream
			this.prefetchSubscription = stream.subscribe()
			return
		}

		const difficulty = this.difficultyService.getDifficulty()
		const stream = (
			this.store.gameMode() === 'standalone-classic' ? this.gamePlayApi.getStandaloneClassicCues(difficulty) : this.gamePlayApi.getCues(difficulty)
		).pipe(shareReplay({ bufferSize: 1, refCount: false }))
		this.classicPrefetch = { difficulty, stream }
		this.prefetchSubscription = stream.subscribe()
	}

	consumeDailyCues(): Observable<DailyCuesResponse> | null {
		const stream = this.dailyCues$
		this.dailyCues$ = null
		this.prefetchSubscription?.unsubscribe()
		this.prefetchSubscription = null
		return stream
	}

	consumeClassicCues(difficulty: Difficulty): Observable<ClassicCuesResponse> | null {
		const prefetch = this.classicPrefetch
		this.classicPrefetch = null
		this.prefetchSubscription?.unsubscribe()
		this.prefetchSubscription = null

		if (!prefetch || prefetch.difficulty !== difficulty) {
			return null
		}

		return prefetch.stream
	}

	clear(): void {
		this.dailyCues$ = null
		this.classicPrefetch = null
		this.prefetchSubscription?.unsubscribe()
		this.prefetchSubscription = null
	}
}

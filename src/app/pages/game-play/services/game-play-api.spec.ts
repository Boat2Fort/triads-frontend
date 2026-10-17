import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

import { GlobalStore } from '../../../state/global.store'
import { GamePlayApi } from './game-play-api'
import { TurnHintService } from './turn-hint.service'

describe('Gameplay request context', () => {
	let api: GamePlayApi
	let http: HttpTestingController
	let store: InstanceType<typeof GlobalStore>
	const cues = ['PUSH-', 'CAMPAIGN', 'PANIC']

	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] })
		api = TestBed.inject(GamePlayApi)
		http = TestBed.inject(HttpTestingController)
		store = TestBed.inject(GlobalStore)
	})

	afterEach(() => http.verify())

	it('scopes triad checks, answers, and hints to the current group and round', () => {
		store.setTriadGroupId(42)
		store.updateTriadStep('FINAL')
		api.checkTriad(cues).subscribe()
		api.checkAnswer(cues, 'BUTTON').subscribe()
		TestBed.inject(TurnHintService).getHint(cues, 'FIRST_LETTER').subscribe()
		const requests = http.match(() => true)
		expect(requests.length).toBe(3)
		for (const req of requests) {
			expect(req.request.params.get('triadGroupId')).toBe('42')
			expect(req.request.params.get('triadsStep')).toBe('FINAL')
			expect(req.request.params.getAll('cues')).toEqual(cues)
			req.flush(false)
		}
	})

	it('does not serialize an undefined group into legacy requests', () => {
		api.checkTriad(cues).subscribe()
		const req = http.expectOne((r) => r.url === 'triads/check-triad')
		expect(req.request.params.has('triadGroupId')).toBeFalse()
		expect(req.request.params.has('triadsStep')).toBeFalse()
		req.flush(false)
	})
	it('completes the loaded puzzle date even after the calendar day changes', () => {
		store.setDailyPuzzleDate('2026-10-16')
		api.postDailyComplete('won', 15).subscribe()
		const req = http.expectOne((r) => r.url === 'triads/daily/complete')
		expect(req.request.body).toEqual({ outcome: 'won', score: 15, puzzleDate: '2026-10-16' })
		req.flush({ ok: true, puzzleDate: '2026-10-16', nextPuzzleAt: '2026-10-18T04:00:00Z' })
	})
})

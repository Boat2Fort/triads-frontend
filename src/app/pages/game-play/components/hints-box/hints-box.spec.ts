import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { ActionSheetController } from '@ionic/angular/standalone'

import { AssetPreloadService } from '../../../../shared/services/asset-preload.service'
import { GlobalStore } from '../../../../state/global.store'
import { GamePlayState } from '../../enums/game-play.enum'
import { HintsBox } from './hints-box'

describe('HintsBox gameplay', () => {
	let component: HintsBox
	let fixture: ComponentFixture<HintsBox>
	let store: InstanceType<typeof GlobalStore>
	let http: HttpTestingController
	const cues = ['PUSH-', 'CAMPAIGN', 'PANIC']

	beforeEach(async () => {
		localStorage.clear()
		await TestBed.configureTestingModule({
			imports: [HintsBox],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: ActionSheetController, useValue: { create: jasmine.createSpy('create') } },
				{ provide: AssetPreloadService, useValue: { imageVersion: () => 0, getImageUrl: (p: string) => p } },
			],
		})
			.overrideComponent(HintsBox, { set: { template: '' } })
			.compileComponents()
		store = TestBed.inject(GlobalStore)
		store.setTriadGroupId(7)
		store.setCues([...cues, 'AIR', 'WINE', 'AUTHORITY'])
		store.setGamePlayState(GamePlayState.PLAYING)
		http = TestBed.inject(HttpTestingController)
		fixture = TestBed.createComponent(HintsBox)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	afterEach(() => {
		fixture.destroy()
		http.verify()
		localStorage.clear()
	})

	it('selects hyphenated hint cues and charges one hint and one turn without a second network request', () => {
		component.useHint()
		component.useHint()
		const req = http.expectOne((r) => r.url === 'triads/hint')
		expect(req.request.params.get('triadGroupId')).toBe('7')
		req.flush({ hint: cues })
		http.expectNone((r) => r.url === 'triads/check-triad')
		expect(store.selectedCues()).toEqual(cues)
		expect(store.hints().filter((h) => h.available).length).toBe(1)
		expect(store.turns().filter((t) => t.available).length).toBe(2)
		expect(store.gamePlayState()).toBe(GamePlayState.ACCEPT_ANSWER)
	})

	it('retains a letter hint when it also selects the hinted triad', () => {
		component.useHint('FIRST_LETTER')
		http.expectOne((r) => r.url === 'triads/hint').flush({ hint: cues, with: 'FIRST_LETTER', withValue: 'B' })
		expect(store.firstLetterHint()).toBe('B')
		expect(store.usedHintTypes()).toEqual(['FIRST_LETTER'])
		expect(store.selectedCues()).toEqual(cues)
	})

	it('does not grant a free guess or consume resources after a hint request fails', () => {
		component.useHint()
		http.expectOne((r) => r.url === 'triads/hint').flush('offline', { status: 503, statusText: 'Unavailable' })
		expect(store.hintUsed()).toBeFalse()
		expect(store.hintUsedWithOneTurnRemaining()).toBeFalse()
		expect(store.turns().every((t) => t.available)).toBeTrue()
		expect(store.hints().every((h) => h.available)).toBeTrue()
		expect(store.isFetchingHint()).toBeFalse()
	})

	it('does not mark an unavailable hint as used', () => {
		component.useHint()
		http.expectOne((r) => r.url === 'triads/hint').flush({ hint: null })
		expect(store.hintUsed()).toBeFalse()
		expect(store.hints().every((h) => h.available)).toBeTrue()
	})

	it('blocks hints during an answer request, feedback, bonus loading, or a completed game', () => {
		for (const state of [GamePlayState.CORRECT_ANSWER, GamePlayState.WRONG_ANSWER, GamePlayState.WRONG_TRIAD, GamePlayState.WON, GamePlayState.LOST]) {
			store.setGamePlayState(state)
			component.onHintClick()
		}
		store.setGamePlayState(GamePlayState.ACCEPT_ANSWER)
		store.setIsCheckingAnswer(true)
		component.onHintClick()
		store.setIsCheckingAnswer(false)
		store.setIsFetchingFinalTriadCues(true)
		component.onHintClick()
		http.expectNone(() => true)
		expect(store.hints().every((h) => h.available)).toBeTrue()
	})

	it('can use a hint on the last turn without ending the game', () => {
		store.setTurns(store.turns().map((t, i) => ({ ...t, available: i === 0 })))
		component.useHint('KEYWORD_LENGTH')
		http.expectOne((r) => r.url === 'triads/hint').flush({ hint: cues, with: 'KEYWORD_LENGTH', withValue: 6 })
		expect(store.turns().filter((t) => t.available).length).toBe(1)
		expect(store.keywordLengthHint()).toBe(6)
		expect(store.hintUsedWithOneTurnRemaining()).toBeTrue()
	})

	it('charges an invalid selected triad once and then permits a new selection', fakeAsync(() => {
		store.setSelectedCues(['PUSH-', 'AIR', 'WINE'])
		store.setGamePlayState(GamePlayState.CHECK_SOLUTION)
		component.onHintClick()
		http.expectOne((r) => r.url === 'triads/check-triad').flush(false)
		expect(store.hints().filter((h) => h.available).length).toBe(1)
		expect(store.turns().filter((t) => t.available).length).toBe(2)
		expect(store.gamePlayState()).toBe(GamePlayState.WRONG_TRIAD)
		tick(2000)
		expect(store.selectedCues()).toEqual([])
		expect(store.gamePlayState()).toBe(GamePlayState.PLAYING)
	}))

	it('cancels pending hint requests on navigation', () => {
		component.useHint()
		const req = http.expectOne((r) => r.url === 'triads/hint')
		fixture.destroy()
		expect(req.cancelled).toBeTrue()
		expect(store.hints().every((h) => h.available)).toBeTrue()
	})
})

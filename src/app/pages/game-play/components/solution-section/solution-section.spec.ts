import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing'

import { GlobalStore } from '../../../../state/global.store'
import { GamePlayState } from '../../enums/game-play.enum'
import { GamePlayLogic } from '../../services/game-play-logic'
import { SolutionSection } from './solution-section'

describe('SolutionSection gameplay', () => {
	let component: SolutionSection
	let fixture: ComponentFixture<SolutionSection>
	let store: InstanceType<typeof GlobalStore>
	let http: HttpTestingController
	const cues = ['PUSH-', 'CAMPAIGN', 'PANIC']
	const solved = { id: 1, keyword: 'BUTTON', cues, fullPhrases: ['PUSH-BUTTON', 'CAMPAIGN BUTTON', 'PANIC BUTTON'] }

	beforeEach(async () => {
		localStorage.clear()
		spyOn(HTMLMediaElement.prototype, 'play').and.resolveTo()
		await TestBed.configureTestingModule({
			imports: [SolutionSection],
			providers: [provideHttpClient(), provideHttpClientTesting()],
		})

			.compileComponents()
		store = TestBed.inject(GlobalStore)
		store.setTriadGroupId(7)
		store.setCues([...cues, 'CARRIER', 'CLAY', 'STOOL', 'AUTHORITY', 'AIR', 'WINE'])
		store.setSelectedCues(cues)
		store.setGamePlayState(GamePlayState.ACCEPT_ANSWER)
		http = TestBed.inject(HttpTestingController)
		fixture = TestBed.createComponent(SolutionSection)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	afterEach(() => {
		fixture.destroy()
		http.verify()
		localStorage.clear()
	})

	it('pops and removes the exact hyphenated cues and auto-selects the last initial triad', fakeAsync(() => {
		store.setCues([...cues, 'CARRIER', 'CLAY', 'STOOL'])
		component.submitAnswer(' button ')
		const req = http.expectOne((r) => r.url === 'triads/check-answer')
		expect(req.request.params.get('triadGroupId')).toBe('7')
		expect(req.request.params.get('triadsStep')).toBe('INITIAL')
		expect(req.request.params.get('answer')).toBe('button')
		req.flush(solved)
		expect(store.gamePlayState()).toBe(GamePlayState.CORRECT_ANSWER)
		tick(300)
		expect(store.cuesToExplode()).toEqual(cues)
		tick(1700)
		expect(store.cues()).toEqual(['CARRIER', 'CLAY', 'STOOL'])
		expect(store.selectedCues()).toEqual(['CARRIER', 'CLAY', 'STOOL'])
		expect(store.gamePlayState()).toBe(GamePlayState.CHECK_SOLUTION)
		expect(store.solvedTriads().length).toBe(1)
	}))

	it('ignores repeated submissions while checking and throughout the success animation', fakeAsync(() => {
		component.submitAnswer('BUTTON')
		component.submitAnswer('BUTTON')
		http.expectOne((r) => r.url === 'triads/check-answer').flush(solved)
		component.submitAnswer('BUTTON')
		http.expectNone((r) => r.url === 'triads/check-answer')
		tick(2000)
		expect(store.solvedTriads().length).toBe(1)
	}))

	it('does not consume extra turns when Enter is repeated during wrong-answer feedback', fakeAsync(() => {
		component.submitAnswer('WRONG')
		http.expectOne((r) => r.url === 'triads/check-answer').flush(false)
		component.submitAnswer('WRONG')
		http.expectNone((r) => r.url === 'triads/check-answer')
		expect(store.turns().filter((t) => t.available).length).toBe(2)
		tick(2000)
		expect(store.gamePlayState()).toBe(GamePlayState.ACCEPT_ANSWER)
	}))

	it('blocks answer submission during hint loading and preserves the selected triad on network errors', () => {
		store.setIsFetchingHint(true)
		component.submitAnswer('BUTTON')
		http.expectNone((r) => r.url === 'triads/check-answer')
		store.setIsFetchingHint(false)
		component.submitAnswer('BUTTON')
		http.expectOne((r) => r.url === 'triads/check-answer').flush('offline', { status: 503, statusText: 'Unavailable' })
		expect(store.isCheckingAnswer()).toBeFalse()
		expect(store.selectedCues()).toEqual(cues)
		expect(store.turns().every((t) => t.available)).toBeTrue()
		expect(component.serverError()).toBeTruthy()
	})

	it('can retry a failed bonus load without replaying the third triad', fakeAsync(() => {
		store.setCues(cues)
		component.submitAnswer('BUTTON')
		http.expectOne((r) => r.url === 'triads/check-answer').flush(solved)
		tick(2000)
		http.expectOne((r) => r.url === 'triads/fourth-triad-cues').flush('offline', { status: 503, statusText: 'Unavailable' })
		flushMicrotasks()
		expect(store.triadsStep()).toBe('FINAL')
		expect(store.isFetchingFinalTriadCues()).toBeFalse()
		expect(component.serverError()).toBeTruthy()
		void component.loadFinalTriadCues()
		http.expectOne((r) => r.url === 'triads/fourth-triad-cues').flush(['BUTTON', 'PIGEON', 'PORT'])
		flushMicrotasks()
		expect(store.finalTriadCues()).toEqual(['BUTTON', 'PIGEON', 'PORT'])
		expect(store.selectedCues()).toEqual(['BUTTON', 'PIGEON', 'PORT'])
		expect(store.gamePlayState()).toBe(GamePlayState.CHECK_SOLUTION)
		expect(component.serverError()).toBeNull()
	}))

	it('wins exactly once when the bonus answer is accepted', fakeAsync(() => {
		const logic = TestBed.inject(GamePlayLogic)
		spyOn(logic, 'handleGameWon').and.callThrough()
		store.setCues([])
		store.updateTriadStep('FINAL')
		store.setFinalTriadCues(cues)
		component.submitAnswer('BUTTON')
		http.expectOne((r) => r.url === 'triads/check-answer').flush(solved)
		tick(2000)
		expect(logic.handleGameWon).toHaveBeenCalledTimes(1)
		expect(store.gamePlayState()).toBe(GamePlayState.WON)
	}))

	it('cancels a pending bonus request when the component is destroyed', fakeAsync(() => {
		store.updateTriadStep('FINAL')
		void component.loadFinalTriadCues()
		const req = http.expectOne((r) => r.url === 'triads/fourth-triad-cues')
		fixture.destroy()
		flushMicrotasks()
		expect(req.cancelled).toBeTrue()
		expect(store.finalTriadCues()).toBeNull()
	}))
	it('completes all three initial triads and the bonus with a perfect score', fakeAsync(() => {
		const triads = [
			solved,
			{ id: 2, keyword: 'PIGEON', cues: ['CARRIER', 'CLAY', 'STOOL'], fullPhrases: [] },
			{ id: 3, keyword: 'PORT', cues: ['AUTHORITY', 'AIR', 'WINE'], fullPhrases: [] },
		]
		for (const triad of triads) {
			store.setSelectedCues(triad.cues)
			store.setGamePlayState(GamePlayState.CHECK_SOLUTION)
			component.checkTriad()
			http.expectOne((r) => r.url === 'triads/check-triad').flush(true)
			component.submitAnswer(triad.keyword)
			http.expectOne((r) => r.url === 'triads/check-answer').flush(triad)
			tick(2000)
		}
		const bonusCues = ['BUTTON', 'PIGEON', 'PORT']
		http.expectOne((r) => r.url === 'triads/fourth-triad-cues').flush(bonusCues)
		flushMicrotasks()
		expect(store.cues()).toEqual([])
		expect(store.selectedCues()).toEqual(bonusCues)
		component.checkTriad()
		http.expectOne((r) => r.url === 'triads/check-triad').flush(true)
		component.submitAnswer('HOLE')
		const answer = http.expectOne((r) => r.url === 'triads/check-answer')
		expect(answer.request.params.get('triadsStep')).toBe('FINAL')
		answer.flush({ id: 4, keyword: 'HOLE', cues: bonusCues, fullPhrases: [] })
		tick(2000)
		expect(store.solvedTriads().map((t) => t.keyword)).toEqual(['BUTTON', 'PIGEON', 'PORT', 'HOLE'])
		expect(store.gamePlayState()).toBe(GamePlayState.WON)
		expect(store.gameScore()).toBe(15)
	}))

	it('cancels an old answer request when a new game resets the component', () => {
		component.submitAnswer('BUTTON')
		const req = http.expectOne((r) => r.url === 'triads/check-answer')
		component.resetComponentState()
		store.resetGameState()
		expect(req.cancelled).toBeTrue()
		expect(store.solvedTriads()).toEqual([])
	})
	it('ignores a bonus response resolved just before a new game reset', fakeAsync(() => {
		store.updateTriadStep('FINAL')
		void component.loadFinalTriadCues()
		http.expectOne((r) => r.url === 'triads/fourth-triad-cues').flush(['BUTTON', 'PIGEON', 'PORT'])
		component.resetComponentState()
		store.resetGameState()
		flushMicrotasks()
		expect(store.finalTriadCues()).toBeNull()
		expect(store.gamePlayState()).toBe(GamePlayState.IDLE)
	}))

	it('renders a retry action and error after the bonus load fails', fakeAsync(() => {
		store.updateTriadStep('FINAL')
		void component.loadFinalTriadCues()
		http.expectOne((r) => r.url === 'triads/fourth-triad-cues').flush('offline', { status: 503, statusText: 'Unavailable' })
		flushMicrotasks()
		fixture.detectChanges()
		expect(fixture.nativeElement.textContent).toContain('Retry bonus round')
		expect(fixture.nativeElement.textContent).toContain(component.serverError())
	}))
})

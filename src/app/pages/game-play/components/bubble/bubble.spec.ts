import { provideHttpClient } from '@angular/common/http'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { AssetPreloadService } from '../../../../shared/services/asset-preload.service'
import { GlobalStore } from '../../../../state/global.store'
import { GamePlayState } from '../../enums/game-play.enum'
import { Bubble } from './bubble'

describe('Bubble gameplay interaction', () => {
	let component: Bubble
	let fixture: ComponentFixture<Bubble>
	let store: InstanceType<typeof GlobalStore>

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [Bubble],
			providers: [provideHttpClient(), { provide: AssetPreloadService, useValue: { imageVersion: () => 0, getImageUrl: (p: string) => p } }],
		})
			.overrideComponent(Bubble, { set: { template: '' } })
			.compileComponents()
		store = TestBed.inject(GlobalStore)
		fixture = TestBed.createComponent(Bubble)
		fixture.componentRef.setInput('cue', 'PUSH-')
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('selects and deselects the exact cue including its hyphen', () => {
		store.setGamePlayState(GamePlayState.PLAYING)
		component.whenClicked()
		expect(store.selectedCues()).toEqual(['PUSH-'])
		component.whenClicked()
		expect(store.selectedCues()).toEqual([])
	})

	it('ignores clicks during feedback, after game completion, and while requests are pending', () => {
		for (const state of [GamePlayState.CORRECT_ANSWER, GamePlayState.WRONG_ANSWER, GamePlayState.WRONG_TRIAD, GamePlayState.WON, GamePlayState.LOST]) {
			store.setGamePlayState(state)
			component.whenClicked()
			expect(store.selectedCues()).toEqual([])
		}
		store.setGamePlayState(GamePlayState.PLAYING)
		store.setIsCheckingAnswer(true)
		component.whenClicked()
		expect(store.selectedCues()).toEqual([])
	})
})

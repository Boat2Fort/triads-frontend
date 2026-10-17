import { Component, computed, ElementRef, inject, input } from '@angular/core'
import { AnimationOptions, LottieDirective } from 'ngx-lottie'

import { AssetPreloadService } from '../../../../shared/services/asset-preload.service'
import { GlobalStore } from '../../../../state/global.store'
import { GamePlayState } from '../../enums/game-play.enum'
import { GamePlayLogic } from '../../services/game-play-logic'

const BUBBLE_IMAGE_PATH = 'images/bubble.png'
const BUBBLE_POP_LOTTIE_PATH = 'lotties/bubble-explosion.json'

@Component({
	selector: 'app-bubble',
	imports: [LottieDirective],
	templateUrl: './bubble.html',
	styleUrl: './bubble.scss',
})
export class Bubble {
	readonly store = inject(GlobalStore)

	private readonly gamePlayLogic = inject(GamePlayLogic)

	private readonly assetPreloadService = inject(AssetPreloadService)

	cue = input.required<string>()

	text = computed(() => this.cue())

	selected = computed<boolean>(() => this.store.selectedCues().some((cue) => cue === this.cue()))

	pop = computed<boolean>(() => this.store.cuesToExplode().includes(this.cue()))

	isDisabled = computed<boolean>(
		() =>
			![GamePlayState.PLAYING, GamePlayState.CHECK_SOLUTION, GamePlayState.ACCEPT_ANSWER].includes(this.store.gamePlayState()) ||
			this.store.isCheckingTriad() ||
			this.store.isCheckingAnswer() ||
			this.store.isFetchingHint() ||
			this.store.isFetchingFinalTriadCues(),
	)

	readonly bubbleBackgroundImage = computed(() => {
		this.assetPreloadService.imageVersion()
		return `url("${this.assetPreloadService.getImageUrl(BUBBLE_IMAGE_PATH)}")`
	})

	// Expose host element so parent can position it
	element = inject<ElementRef<HTMLElement>>(ElementRef)

	readonly bubblePopLottieOptions = computed<AnimationOptions>(() => {
		this.assetPreloadService.lottieVersion()
		const animationData = this.assetPreloadService.getLottie(BUBBLE_POP_LOTTIE_PATH)
		return {
			...(animationData ? { animationData } : { path: BUBBLE_POP_LOTTIE_PATH }),
			autoplay: true,
			loop: false,
		}
	})

	whenClicked() {
		if (this.isDisabled()) {
			return
		}

		const selectedCuesLength = this.store.selectedCues().length
		if (this.selected()) {
			this.store.removeSelectedCue(this.cue())
			this.gamePlayLogic.resetAnswerFieldState()
			this.store.setGamePlayState(GamePlayState.PLAYING)
		} else if (selectedCuesLength < 3) {
			this.store.addSelectedCue(this.cue())
			if (selectedCuesLength === 2) {
				this.store.setGamePlayState(GamePlayState.CHECK_SOLUTION)
			}
		}
	}
}

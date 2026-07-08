import { Component, computed, ElementRef, inject, model, OnInit, signal, viewChild } from '@angular/core'
import { FormsModule, NgForm } from '@angular/forms'
import { AnimationOptions, LottieComponent } from 'ngx-lottie'

import { AssetPreloadService } from '../../../../shared/services/asset-preload.service'
import { UserService } from '../../../../shared/services/user.service'
import { GlobalStore } from '../../../../state/global.store'

const HOW_TO_PLAY_LOTTIE_PATH = 'lotties/how-to-play-lottie.json'
const PLAY_BUTTON_LOTTIE_PATH = 'lotties/play-button-lottie.json'
const TRIADS_LOGO_IMAGE_PATH = 'images/triads-logo-animated.svg?v=3'

@Component({
	selector: 'app-user-info-dialog',
	imports: [FormsModule, LottieComponent],
	templateUrl: './user-info-dialog.html',
	styleUrl: './user-info-dialog.scss',
})
export class UserInfoDialog implements OnInit {
	readonly store = inject(GlobalStore)

	readonly logoUrl = computed(() => {
		this.assetPreloadService.imageVersion()
		return this.assetPreloadService.getImageUrl(TRIADS_LOGO_IMAGE_PATH)
	})

	usernameInput = viewChild.required<ElementRef<HTMLInputElement>>('usernameInput')

	usernameModel = model<string | null>(null)

	nameAccepted = signal(false)

	showAcceptNameHint = signal(false)

	generatedUsername: string | null = null

	readonly infoButtonLottieAnimationOptions = computed<AnimationOptions>(() => {
		this.assetPreloadService.lottieVersion()
		const animationData = this.assetPreloadService.getLottie(HOW_TO_PLAY_LOTTIE_PATH)
		return animationData ? { animationData } : { path: HOW_TO_PLAY_LOTTIE_PATH }
	})

	readonly playButtonLottieAnimationOptions = computed<AnimationOptions>(() => {
		this.assetPreloadService.lottieVersion()
		const animationData = this.assetPreloadService.getLottie(PLAY_BUTTON_LOTTIE_PATH)
		return animationData ? { animationData } : { path: PLAY_BUTTON_LOTTIE_PATH }
	})

	private readonly userService = inject(UserService)

	private readonly assetPreloadService = inject(AssetPreloadService)

	ngOnInit() {
		this.generateUsername()
		this.usernameInput().nativeElement.focus()
	}

	onSubmit(usernameForm: NgForm) {
		if (usernameForm.form.invalid) {
			this.nameAccepted.set(false)
			return
		}

		if (!this.nameAccepted()) {
			this.showAcceptNameHint.set(true)
			return
		}

		const username = this.usernameModel()
		if (username) {
			this.userService.setUser({ username, scores: { 15: 0, 12: 0, 10: 0, 8: 0, 6: 0, 3: 0, 0: 0 }, firstGameDate: null })
			this.store.setUser({ username, scores: { 15: 0, 12: 0, 10: 0, 8: 0, 6: 0, 3: 0, 0: 0 }, firstGameDate: null })
		}
	}

	acceptName(usernameForm: NgForm) {
		if (usernameForm.form.invalid) {
			this.nameAccepted.set(false)
			return
		}

		this.nameAccepted.set(true)
		this.showAcceptNameHint.set(false)
	}

	onUsernameModelChange(username: string | null) {
		const hasValidLength = typeof username === 'string' && username.trim().length >= 3
		if (!hasValidLength) {
			this.nameAccepted.set(false)
		}
		this.showAcceptNameHint.set(false)
	}

	toggleHowToPlay() {
		this.store.setShowHowToPlay(true)
	}

	private generateUsername() {
		const generatedUsername = this.userService.generateUsername()
		this.generatedUsername = generatedUsername
		this.usernameModel.set(generatedUsername)
		this.nameAccepted.set(false)
		this.showAcceptNameHint.set(false)
	}
}

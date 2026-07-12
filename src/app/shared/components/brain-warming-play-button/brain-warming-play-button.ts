import { DOCUMENT } from '@angular/common'
import { Component, ElementRef, inject, input, OnDestroy, signal, viewChild } from '@angular/core'
import { Router } from '@angular/router'

import { GlobalStore } from '../../../state/global.store'
import { GameCuePrefetchService } from '../../services/game-cue-prefetch.service'
import { PlayRouteIntentService } from '../../services/play-route-intent.service'

const PLAY_HIDE_DELAY_MS = 300
const BURST_AT_MS = 5500
const CONFETTI_MAX_DELAY_MS = 80
const CONFETTI_MAX_DURATION_MS = 200
const NAV_AFTER_BURST_MS = CONFETTI_MAX_DELAY_MS + CONFETTI_MAX_DURATION_MS + 150
const CONFETTI_COUNT = 80
const PARTICLE_SELECTOR = '[data-brain-play-particle="1"]'
const CONFETTI_COLORS = [
	'#FF2200',
	'#FF4400',
	'#FF6B6B',
	'#FF8C00',
	'#FFD700',
	'#FFAA00',
	'#CC0000',
	'#FF3366',
	'#FF0055',
	'#FF6600',
	'#FF1100',
	'#FFA500',
	'#FF4422',
	'#CC3300',
	'#FF2244',
]

@Component({
	selector: 'app-brain-warming-play-button',
	templateUrl: './brain-warming-play-button.html',
	styleUrl: './brain-warming-play-button.scss',
})
export class BrainWarmingPlayButton implements OnDestroy {
	readonly buttonClasses = input('triad-gradient btn btn-lg w-80 max-w-full border-none text-primary-content')

	readonly playLabelText = input('Play Now')

	readonly navigateCommands = input<readonly string[]>(['/classic'])

	/** When true, authorizes the next play-route navigation for the play route guard. */
	readonly authorizeNextPlayNavigation = input(false)

	/**
	 * Optional play mode that the button activates. Setting this updates `GlobalStore.gameMode`
	 * at click time so the brain-warming prefetch (and downstream guards) see the right mode.
	 */
	readonly playMode = input<'classic' | 'daily' | 'standalone-classic' | null>(null)

	readonly animationRunning = signal(false)

	readonly warmupVisible = signal(false)

	private readonly router = inject(Router)

	private readonly document = inject(DOCUMENT)

	private readonly playRouteIntent = inject(PlayRouteIntentService)

	private readonly gameCuePrefetch = inject(GameCuePrefetchService)

	private readonly store = inject(GlobalStore)

	private timers: ReturnType<typeof setTimeout>[] = []

	private readonly playButton = viewChild<ElementRef<HTMLButtonElement>>('playButton')

	private readonly playLabelSpan = viewChild<ElementRef<HTMLSpanElement>>('playLabelSpan')

	ngOnDestroy() {
		this.clearTimers()
		this.removeParticles()
	}

	/** Lets parents reset overlays/timers after route or API refresh without accessing DOM. */
	resetVisualState() {
		this.clearTimers()
		this.removeParticles()
		this.gameCuePrefetch.clear()
		this.animationRunning.set(false)
		this.warmupVisible.set(false)

		const play = this.playLabelSpan()?.nativeElement
		if (play) {
			play.style.opacity = '1'
			play.style.pointerEvents = ''
		}
	}

	onPlayClicked() {
		if (this.animationRunning()) {
			return
		}
		const play = this.playLabelSpan()?.nativeElement
		if (!play) {
			return
		}
		this.animationRunning.set(true)
		const mode = this.playMode()
		if (mode) {
			this.store.setGameMode(mode)
		}
		this.gameCuePrefetch.startPrefetch()

		play.style.opacity = '0'
		play.style.pointerEvents = 'none'
		this.clearTimers()
		this.removeParticles()
		this.warmupVisible.set(false)

		this.after(PLAY_HIDE_DELAY_MS, () => {
			this.warmupVisible.set(true)
		})

		this.after(PLAY_HIDE_DELAY_MS + BURST_AT_MS, () => {
			this.launchConfetti()
		})

		const navigateAt = PLAY_HIDE_DELAY_MS + BURST_AT_MS + NAV_AFTER_BURST_MS
		this.after(navigateAt, () => {
			if (this.authorizeNextPlayNavigation()) {
				this.playRouteIntent.markPending()
			}
			void this.router.navigate(this.navigateCommands()).then((didNavigate) => {
				if (!didNavigate) {
					this.resetVisualState()
				}
			})
		})
	}

	private clearTimers() {
		this.timers.forEach(clearTimeout)
		this.timers = []
	}

	private after(ms: number, fn: () => void) {
		this.timers.push(setTimeout(fn, ms))
	}

	private launchConfetti() {
		const button = this.playButton()?.nativeElement
		if (!button) {
			return
		}

		const rect = button.getBoundingClientRect()
		const cx = rect.left + rect.width / 2
		const cy = rect.top + rect.height / 2

		for (let i = 0; i < CONFETTI_COUNT; i++) {
			const piece = this.document.createElement('div')
			piece.className = 'confetti-piece'
			piece.setAttribute('data-brain-play-particle', '1')
			piece.style.position = 'fixed'
			piece.style.pointerEvents = 'none'
			piece.style.zIndex = '9999'
			piece.style.borderRadius = '2px'

			const isRect = Math.random() > 0.4
			const size = this.rnd(5, 16)

			if (isRect) {
				piece.style.width = `${size}px`
				piece.style.height = `${this.rnd(4, 12)}px`
				piece.style.borderRadius = '2px'
			} else {
				piece.style.width = `${size}px`
				piece.style.height = `${size}px`
				piece.style.borderRadius = '50%'
			}

			piece.style.background = this.pick(CONFETTI_COLORS)
			piece.style.left = `${cx}px`
			piece.style.top = `${cy}px`
			piece.style.opacity = '0'
			piece.style.transform = 'translate(0, 0) rotate(0deg) scale(1)'
			this.document.body.appendChild(piece)

			const angle = this.rnd(0, Math.PI * 2)
			const dist = this.rnd(80, 280)
			const dx = Math.cos(angle) * dist
			const dy = Math.sin(angle) * dist
			const rotation = this.rnd(-540, 540)
			const durationMs = this.rnd(600, 1100)
			const delayMs = this.rnd(0, 80)

			setTimeout(() => {
				piece.style.transition = 'none'
				piece.style.opacity = '1'
				piece.style.transform = 'translate(0, 0) rotate(0deg) scale(1)'

				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						piece.style.transition = `transform ${durationMs}ms cubic-bezier(0.05, 0, 0.6, 1), opacity ${Math.round(durationMs * 0.55)}ms ease ${Math.round(durationMs * 0.4)}ms`
						piece.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotation}deg) scale(0.15)`
						piece.style.opacity = '0'
					})
				})

				setTimeout(() => {
					piece.remove()
				}, durationMs + 200)
			}, delayMs)
		}
	}

	private rnd(min: number, max: number): number {
		return min + Math.random() * (max - min)
	}

	private pick<T>(arr: readonly T[]): T {
		return arr[Math.floor(Math.random() * arr.length)] as T
	}

	private removeParticles() {
		this.document.querySelectorAll(PARTICLE_SELECTOR).forEach((p) => p.remove())
	}
}

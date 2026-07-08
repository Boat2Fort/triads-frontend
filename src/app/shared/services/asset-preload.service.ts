import { Injectable, type Signal, signal } from '@angular/core'

import { AVAILABLE_SCORE_GIFS, SCORE_GIF_BASE_PATH } from '../../pages/game-play/constants/share.constant'

export interface PreloadProgress {
	loaded: number
	total: number
	failed: number
}

export type PreloadProgressListener = (progress: PreloadProgress) => void

const DEFAULT_PRELOAD_TIMEOUT_MS = 15_000
const UNLOCK_EVENTS: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'touchstart']

interface CachedImageAsset {
	element: HTMLImageElement
	resolvedUrl: string
}

/**
 * Normalizes an asset path used as a cache key. The app uses both `"images/foo.png"`
 * and `"/images/foo.png"` in different places, and the browser treats them as the
 * same URL. We strip any leading slash so the cache is keyed consistently.
 */
function normalizeKey(path: string): string {
	return path.replace(/^\/+/, '')
}

/**
 * Preloads and caches all application assets (images, lotties, sounds) so that
 * consumers never hit network or decoding latency at the moment of first use.
 *
 * - Images: decoded via `HTMLImageElement.decode()` and kept alive in memory.
 * - Lotties: JSON parsed once and kept in memory as `animationData` for ngx-lottie.
 * - Sounds: decoded once into `AudioBuffer`s and played back via short-lived
 *   `AudioBufferSourceNode`s for overlap-safe, zero-latency playback.
 *
 * State is stored on static fields so that the instance created manually in
 * `main.ts` (before Angular bootstraps) and the instance later produced by the
 * root injector share the same caches and audio context.
 */
@Injectable({
	providedIn: 'root',
})
export class AssetPreloadService {
	static readonly LOTTIE_PATHS: readonly string[] = [
		'lotties/loading-lottie.json',
		'lotties/how-to-play-lottie.json',
		'lotties/play-button-lottie.json',
		'lotties/correct-answer-lottie.json',
		'lotties/wrong-answer-lottie.json',
		'lotties/bubble-burst-confetti.json',
		'lotties/bubble-explosion.json',
		'lotties/bubble-lottie.json',
		'lotties/box-lottie.json',
		'lotties/pop-lottie.json',
	]

	static readonly SOUND_PATHS: readonly string[] = ['sounds/ta-dah.mp3', 'sounds/three-pops.mp3', 'sounds/pop.mp3']

	static readonly IMAGE_PATHS: readonly string[] = [
		'images/main-background.jpg',
		'images/bubble.png',
		'images/turn-one.png',
		'images/turn-two.png',
		'images/turn-three.png',
		'images/lifesaver.svg',
		'images/triads-logo-animated.svg?v=3',
		'images/triads-logo-animated.gif',
		...AVAILABLE_SCORE_GIFS.map((score) => `${SCORE_GIF_BASE_PATH}score-${score}.gif`),
	]

	private static readonly lottieCache = new Map<string, unknown>()

	private static readonly lottieCacheVersion = signal(0)

	private static readonly imageCache = new Map<string, CachedImageAsset>()

	private static readonly imageCacheVersion = signal(0)

	private static readonly audioBufferCache = new Map<string, AudioBuffer>()

	private static audioContext: AudioContext | null = null

	private static audioUnlocked = false

	private static audioUnlockHandler: (() => void) | null = null

	private static preloadPromise: Promise<PreloadProgress> | null = null

	readonly imageVersion: Signal<number> = AssetPreloadService.imageCacheVersion.asReadonly()

	readonly lottieVersion: Signal<number> = AssetPreloadService.lottieCacheVersion.asReadonly()

	/**
	 * Kicks off the full preload. Subsequent calls return the same promise.
	 *
	 * The promise resolves once every asset has either loaded or failed. If a
	 * positive `timeoutMs` is supplied, the promise is also settled once the
	 * timer elapses so the caller can proceed without waiting for stragglers.
	 */
	preloadAll(options: { onProgress?: PreloadProgressListener; timeoutMs?: number } = {}): Promise<PreloadProgress> {
		if (AssetPreloadService.preloadPromise) {
			return AssetPreloadService.preloadPromise
		}

		const { onProgress, timeoutMs = DEFAULT_PRELOAD_TIMEOUT_MS } = options

		AssetPreloadService.ensureAudioContext()
		AssetPreloadService.installAudioUnlockListeners()

		const tasks: Promise<unknown>[] = [
			...AssetPreloadService.IMAGE_PATHS.map((path) => AssetPreloadService.preloadImage(path)),
			...AssetPreloadService.LOTTIE_PATHS.map((path) => AssetPreloadService.preloadLottie(path)),
			...AssetPreloadService.SOUND_PATHS.map((path) => AssetPreloadService.preloadSound(path)),
		]

		const total = tasks.length
		const progress: PreloadProgress = { loaded: 0, total, failed: 0 }

		onProgress?.(progress)

		const trackedTasks = tasks.map((task) =>
			task
				.then(() => {
					progress.loaded += 1
				})
				.catch(() => {
					progress.loaded += 1
					progress.failed += 1
				})
				.finally(() => {
					onProgress?.(progress)
				}),
		)

		const allDone = Promise.all(trackedTasks).then(() => progress)

		if (timeoutMs <= 0) {
			AssetPreloadService.preloadPromise = allDone
			return AssetPreloadService.preloadPromise
		}

		const timedOut = new Promise<PreloadProgress>((resolve) => {
			window.setTimeout(() => resolve(progress), timeoutMs)
		})

		AssetPreloadService.preloadPromise = Promise.race([allDone, timedOut])
		return AssetPreloadService.preloadPromise
	}

	/**
	 * Returns the parsed Lottie JSON for a given path, or `null` if it was not
	 * preloaded (e.g., preload failed or timed out). Consumers should pass the
	 * result as `animationData` to ngx-lottie to avoid re-parsing per instance.
	 */
	getLottie(path: string): unknown | null {
		return AssetPreloadService.lottieCache.get(normalizeKey(path)) ?? null
	}

	/**
	 * Returns the cached, already-decoded `HTMLImageElement` for a given path.
	 * Most consumers should prefer `getImageUrl()`, which returns the stable
	 * object URL backed by the preloaded Blob for direct template binding.
	 */
	getImage(path: string): HTMLImageElement | null {
		return AssetPreloadService.imageCache.get(normalizeKey(path))?.element ?? null
	}

	/**
	 * Returns the resolved URL that should be bound in templates. When an image
	 * has been preloaded, this is a stable in-memory object URL backed by the
	 * already-fetched Blob, so consumers avoid a second request for the original
	 * asset path.
	 */
	getImageUrl(path: string): string {
		const key = normalizeKey(path)
		return AssetPreloadService.imageCache.get(key)?.resolvedUrl ?? key
	}

	/**
	 * Plays a preloaded sound with zero decoding latency. Multiple calls overlap
	 * naturally because each play creates a short-lived `BufferSource`.
	 */
	playSound(path: string, options: { volume?: number; playbackRate?: number } = {}): void {
		const buffer = AssetPreloadService.audioBufferCache.get(normalizeKey(path))
		const context = AssetPreloadService.audioContext
		if (!buffer || !context) {
			return
		}

		const { volume = 1, playbackRate = 1 } = options

		// Some browsers keep the context suspended until a user gesture. If we are
		// still suspended at play-time (e.g., autoplay attempt), attempt a resume
		// and bail silently if it is rejected — the caller did not await a gesture.
		if (context.state === 'suspended') {
			context.resume().catch(() => {
				// User gesture has not occurred yet; silently skip playback.
			})
		}

		const source = context.createBufferSource()
		source.buffer = buffer
		source.playbackRate.value = playbackRate

		const gain = context.createGain()
		gain.gain.value = volume

		source.connect(gain).connect(context.destination)
		source.start(0)
	}

	private static async preloadImage(path: string): Promise<void> {
		const key = normalizeKey(path)
		if (AssetPreloadService.imageCache.has(key)) {
			return
		}

		let resolvedUrl: string | null = null

		try {
			const response = await fetch(key, { cache: 'force-cache' })
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`)
			}

			const blob = await response.blob()
			resolvedUrl = URL.createObjectURL(blob)

			const img = new Image()
			img.decoding = 'async'
			img.loading = 'eager'
			img.src = resolvedUrl

			const decodePromise = typeof img.decode === 'function' ? img.decode() : AssetPreloadService.waitForImageLoad(img)
			await decodePromise

			AssetPreloadService.imageCache.set(key, { element: img, resolvedUrl })
			AssetPreloadService.imageCacheVersion.update((version) => version + 1)
		} catch (error) {
			if (resolvedUrl) {
				URL.revokeObjectURL(resolvedUrl)
			}
			console.warn(`Failed to preload image: ${key}`, error)
			throw error
		}
	}

	private static waitForImageLoad(img: HTMLImageElement): Promise<void> {
		return new Promise((resolve, reject) => {
			img.addEventListener('load', () => resolve(), { once: true })
			img.addEventListener('error', () => reject(new Error(`Image load failed: ${img.src}`)), { once: true })
		})
	}

	private static async preloadLottie(path: string): Promise<void> {
		const key = normalizeKey(path)
		if (AssetPreloadService.lottieCache.has(key)) {
			return
		}

		try {
			const response = await fetch(key, { cache: 'force-cache' })
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`)
			}
			const data = await response.json()
			AssetPreloadService.lottieCache.set(key, data)
			AssetPreloadService.lottieCacheVersion.update((version) => version + 1)
		} catch (error) {
			console.warn(`Failed to preload lottie: ${key}`, error)
			throw error
		}
	}

	private static async preloadSound(path: string): Promise<void> {
		const key = normalizeKey(path)
		if (AssetPreloadService.audioBufferCache.has(key)) {
			return
		}

		const context = AssetPreloadService.ensureAudioContext()
		if (!context) {
			throw new Error('AudioContext is not supported in this environment')
		}

		try {
			const response = await fetch(key, { cache: 'force-cache' })
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`)
			}
			const arrayBuffer = await response.arrayBuffer()
			const buffer = await context.decodeAudioData(arrayBuffer)
			AssetPreloadService.audioBufferCache.set(key, buffer)
		} catch (error) {
			console.warn(`Failed to preload sound: ${key}`, error)
			throw error
		}
	}

	private static ensureAudioContext(): AudioContext | null {
		if (AssetPreloadService.audioContext) {
			return AssetPreloadService.audioContext
		}
		if (typeof window === 'undefined') {
			return null
		}

		const Ctor =
			(window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext ??
			(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

		if (!Ctor) {
			return null
		}

		try {
			AssetPreloadService.audioContext = new Ctor()
		} catch (error) {
			console.warn('Failed to create AudioContext', error)
			return null
		}
		return AssetPreloadService.audioContext
	}

	/**
	 * Registers listeners that resume the shared `AudioContext` on the first
	 * user interaction. Modern browsers require a gesture before audio can play.
	 */
	private static installAudioUnlockListeners(): void {
		if (AssetPreloadService.audioUnlocked || AssetPreloadService.audioUnlockHandler || typeof document === 'undefined') {
			return
		}

		const handler = () => {
			AssetPreloadService.audioUnlocked = true
			AssetPreloadService.audioContext?.resume().catch(() => {
				// Autoplay policy may still block; playback will simply stay silent.
			})
			AssetPreloadService.removeAudioUnlockListeners()
		}

		AssetPreloadService.audioUnlockHandler = handler
		UNLOCK_EVENTS.forEach((eventName) => {
			document.addEventListener(eventName, handler, { once: true, passive: true })
		})
	}

	private static removeAudioUnlockListeners(): void {
		const handler = AssetPreloadService.audioUnlockHandler
		if (!handler) {
			return
		}
		UNLOCK_EVENTS.forEach((eventName) => {
			document.removeEventListener(eventName, handler)
		})
		AssetPreloadService.audioUnlockHandler = null
	}
}

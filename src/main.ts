import { bootstrapApplication } from '@angular/platform-browser'

import { App } from './app/app'
import { appConfig } from './app/app.config'
import { AssetPreloadService } from './app/shared/services/asset-preload.service'
import { environment } from './environments/environment'

const SPLASH_FADE_OUT_MS = 400

function updateSplashProgress(percent: number): void {
	const bar = document.getElementById('app-splash-bar')
	const label = document.getElementById('app-splash-label')
	const clamped = Math.max(0, Math.min(100, Math.round(percent)))
	if (bar) {
		bar.style.width = `${clamped}%`
	}
	if (label) {
		label.textContent = `Loading ${clamped}%`
	}
}

function hideSplash(): void {
	const splash = document.getElementById('app-splash')
	if (!splash) {
		return
	}
	splash.dataset['fadeOut'] = 'true'
	window.setTimeout(() => splash.remove(), SPLASH_FADE_OUT_MS)
}

const assetPreloadService = new AssetPreloadService()

document.title = environment.appEdition === 'classic' ? 'Triads Classic' : 'Triads'

const assetsReady = assetPreloadService.preloadAll({
	onProgress: ({ loaded, total }) => {
		if (total === 0) {
			updateSplashProgress(100)
			return
		}
		updateSplashProgress((loaded / total) * 100)
	},
	timeoutMs: 15_000,
})

assetsReady
	.then(() => bootstrapApplication(App, appConfig))
	.catch((err) => console.error(err))
	.finally(() => {
		// Hide splash after Angular has a chance to paint its first view.
		requestAnimationFrame(() => hideSplash())
	})

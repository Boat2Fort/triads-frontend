import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, viewChild } from '@angular/core'
import { NavigationEnd, Router } from '@angular/router'
import { filter, Subject, takeUntil } from 'rxjs'

import { BrainWarmingPlayButton } from '../../shared/components/brain-warming-play-button/brain-warming-play-button'
import { AssetPreloadService } from '../../shared/services/asset-preload.service'
import { GlobalStore } from '../../state/global.store'
import { UserInfoDialog } from '../home/components/user-info-dialog/user-info-dialog'

const TRIADS_LOGO_IMAGE_PATH = 'images/triads-logo-animated.svg?v=3'

@Component({
	selector: 'app-classic-home',
	imports: [BrainWarmingPlayButton, UserInfoDialog],
	template: `
		<div class="relative h-full w-full">
			@if (store.user()) {
				<div class="flex h-full w-full flex-col items-center justify-center gap-3 px-4 py-6 text-center">
					<div class="flex w-full max-w-md flex-col items-center gap-3">
						<img
							[src]="logoUrl()"
							alt="Triads Classic"
							decoding="async"
							class="mx-auto h-auto w-full max-w-70 scale-200 object-contain"
							width="280"
							height="200" />
						<p class="mt-1 text-sm font-semibold uppercase tracking-[0.3em] text-base-content/70">Classic</p>
						<div class="mt-2 w-80 max-w-full">
							<app-brain-warming-play-button
								#classicPlayButton
								[buttonClasses]="'triad-gradient btn btn-lg w-full border-none text-primary-content'"
								[navigateCommands]="['/play']"
								[playMode]="'standalone-classic'"
								[authorizeNextPlayNavigation]="true" />
						</div>
					</div>
				</div>
			} @else {
				<app-user-info-dialog />
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassicHomePage implements OnInit, OnDestroy {
	readonly store = inject(GlobalStore)

	private readonly assetPreloadService = inject(AssetPreloadService)

	private readonly router = inject(Router)

	private readonly destroy$ = new Subject<void>()

	readonly classicPlayButton = viewChild<BrainWarmingPlayButton>('classicPlayButton')

	readonly logoUrl = computed(() => {
		this.assetPreloadService.imageVersion()
		return this.assetPreloadService.getImageUrl(TRIADS_LOGO_IMAGE_PATH)
	})

	ngOnInit() {
		this.router.events
			.pipe(
				filter((event): event is NavigationEnd => event instanceof NavigationEnd),
				filter((event) => this.isHomePath(event.urlAfterRedirects)),
				takeUntil(this.destroy$),
			)
			.subscribe(() => this.classicPlayButton()?.resetVisualState())
	}

	ngOnDestroy() {
		this.destroy$.next()
		this.destroy$.complete()
	}

	private isHomePath(url: string): boolean {
		const path = url.split('?')[0] ?? url
		return path === '/' || path === ''
	}
}

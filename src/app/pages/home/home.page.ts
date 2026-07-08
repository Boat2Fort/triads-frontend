import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { NavigationEnd, Router } from '@angular/router'
import { IonModal } from '@ionic/angular/standalone'
import { filter, skip, Subject, takeUntil } from 'rxjs'

import { BrainWarmingPlayButton } from '../../shared/components/brain-warming-play-button/brain-warming-play-button'
import { CLASSIC_CAPACITY_MESSAGE } from '../../shared/constants/global.constant'
import { isApiError, parseApiError } from '../../shared/errors/api-error.util'
import { ClassicExtraQuotaInfo } from '../../shared/interfaces/classic-extra.interface'
import { AssetPreloadService } from '../../shared/services/asset-preload.service'
import { DailyPostPlayService } from '../../shared/services/daily-post-play.service'
import { DailyRolloverService } from '../../shared/services/daily-rollover.service'
import { extractClassicExtraQuota } from '../../shared/utils/classic-extra.util'
import { GlobalStore } from '../../state/global.store'
import { DailyReviewDialog } from '../game-play/components/daily-review-dialog/daily-review-dialog'
import { PlayMoreDialog } from '../game-play/components/play-more-dialog/play-more-dialog'
import { DailyReviewSummary } from '../game-play/interfaces/daily-review.interface'
import { GamePlayApi } from '../game-play/services/game-play-api'
import { UserInfoDialog } from './components/user-info-dialog/user-info-dialog'

const TRIADS_LOGO_IMAGE_PATH = 'images/triads-logo-animated.svg?v=2'

@Component({
	selector: 'app-home',
	imports: [UserInfoDialog, BrainWarmingPlayButton, DailyReviewDialog, PlayMoreDialog, IonModal],
	templateUrl: './home.page.html',
	styleUrl: './home.page.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit, OnDestroy {
	readonly store = inject(GlobalStore)

	private readonly router = inject(Router)

	private readonly gamePlayApi = inject(GamePlayApi)

	private readonly assetPreloadService = inject(AssetPreloadService)

	private readonly dailyPostPlayService = inject(DailyPostPlayService)

	private readonly dailyRolloverService = inject(DailyRolloverService)

	private readonly destroy$ = new Subject<void>()

	private completedDailySummaryRequest: Promise<DailyReviewSummary | null> | null = null

	private stopEasternDayWatcher: (() => void) | null = null

	readonly dailyPlayButton = viewChild<BrainWarmingPlayButton>('dailyPlayButton')

	readonly logoUrl = computed(() => {
		this.assetPreloadService.imageVersion()
		return this.assetPreloadService.getImageUrl(TRIADS_LOGO_IMAGE_PATH)
	})

	readonly dailyInfoLoading = signal(true)

	readonly dailyScheduled = signal(false)

	readonly dailyCompleted = signal(false)

	readonly completedDailySummary = signal<DailyReviewSummary | null>(null)

	readonly completedDailySummaryLoading = signal(false)

	readonly reviewDialogOpen = signal(false)

	readonly playMoreDialogOpen = signal(false)

	readonly loadErrorMessage = signal<string | null>(null)

	readonly classicExtraQuota = signal<ClassicExtraQuotaInfo | null>(null)

	readonly classicExtrasRemaining = computed(() => this.classicExtraQuota()?.classicExtrasRemaining ?? 0)

	readonly canPlayMore = computed(() => this.classicExtrasRemaining() > 0)

	readonly classicCapacityMessage = CLASSIC_CAPACITY_MESSAGE

	readonly easternCalendarLabel = signal(this.dailyRolloverService.easternCalendarLabel())

	ngOnInit() {
		this.loadTodayInfo()

		this.stopEasternDayWatcher = this.dailyRolloverService.startEasternDayWatcher({
			onTimerRollover: () => {
				this.easternCalendarLabel.set(this.dailyRolloverService.easternCalendarLabel())
				this.loadTodayInfo()
			},
			onReentryRollover: () => {
				this.easternCalendarLabel.set(this.dailyRolloverService.easternCalendarLabel())
				// Dismiss any stale post-Daily popups left open across the rollover so they cannot
				// linger over a refreshed home view showing today's puzzle (ADR-0002).
				this.playMoreDialogOpen.set(false)
				this.reviewDialogOpen.set(false)
				this.loadTodayInfo()
			},
		})

		this.router.events
			.pipe(
				filter((e): e is NavigationEnd => e instanceof NavigationEnd),
				filter((e) => this.isHomePath(e.urlAfterRedirects)),
				skip(1),
				takeUntil(this.destroy$),
			)
			.subscribe(() => {
				this.dailyPlayButton()?.resetVisualState()
				this.loadTodayInfo()
			})
	}

	ngOnDestroy() {
		this.stopEasternDayWatcher?.()
		this.stopEasternDayWatcher = null
		this.destroy$.next()
		this.destroy$.complete()
	}

	openPlayMoreDialog() {
		if (!this.canPlayMore()) {
			return
		}

		this.playMoreDialogOpen.set(true)
	}

	closePlayMoreDialog() {
		this.playMoreDialogOpen.set(false)
	}

	async onShareCompletedDaily() {
		const summary = await this.ensureCompletedDailySummaryLoaded()
		if (!summary) {
			return
		}

		await this.dailyPostPlayService.shareScoreImage(summary.score, summary.puzzleDate)
	}

	async onReviewCompletedDaily() {
		const summary = await this.ensureCompletedDailySummaryLoaded()
		if (!summary) {
			return
		}

		this.reviewDialogOpen.set(true)
	}

	closeReviewDialog() {
		this.reviewDialogOpen.set(false)
	}

	private isHomePath(url: string): boolean {
		const path = url.split('?')[0] ?? url
		return path === '/' || path === ''
	}

	private loadTodayInfo() {
		this.dailyInfoLoading.set(true)
		this.loadErrorMessage.set(null)
		this.gamePlayApi.getDailyTodayInfo().subscribe({
			next: (res) => {
				this.dailyInfoLoading.set(false)
				const quota = extractClassicExtraQuota(res)
				this.classicExtraQuota.set(quota)
				if (quota) {
					this.store.setClassicExtraQuota(quota)
				}
				if (res.scheduled) {
					this.dailyScheduled.set(true)
					this.dailyCompleted.set(res.hasCompletedDaily === true)
					if (res.hasCompletedDaily === true) {
						void this.ensureCompletedDailySummaryLoaded()
					} else {
						this.completedDailySummary.set(null)
					}
				} else {
					this.dailyScheduled.set(false)
					this.dailyCompleted.set(false)
					this.completedDailySummary.set(null)
				}
			},
			error: (error) => {
				const apiError = isApiError(error) ? error : parseApiError(error)
				apiError.markHandled()
				this.dailyInfoLoading.set(false)
				this.dailyScheduled.set(false)
				this.dailyCompleted.set(false)
				this.completedDailySummary.set(null)
				this.classicExtraQuota.set(null)
				this.loadErrorMessage.set(apiError.userMessage)
			},
		})
	}

	private async ensureCompletedDailySummaryLoaded(): Promise<DailyReviewSummary | null> {
		const existingSummary = this.completedDailySummary()
		if (existingSummary) {
			return existingSummary
		}

		if (this.completedDailySummaryRequest) {
			return this.completedDailySummaryRequest
		}

		this.completedDailySummaryLoading.set(true)
		this.completedDailySummaryRequest = this.dailyPostPlayService
			.loadCompletedDailySummary()
			.then((summary) => {
				this.completedDailySummary.set(summary)
				return summary
			})
			.catch((error) => {
				const apiError = isApiError(error) ? error : parseApiError(error)
				apiError.markHandled()
				this.loadErrorMessage.set(apiError.userMessage)
				return null
			})
			.finally(() => {
				this.completedDailySummaryLoading.set(false)
				this.completedDailySummaryRequest = null
			})

		return this.completedDailySummaryRequest
	}
}

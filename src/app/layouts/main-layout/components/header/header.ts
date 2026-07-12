import { Component, computed, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NavigationEnd, Router } from '@angular/router'
import { IonModal, IonPopover } from '@ionic/angular/standalone'
import { filter, Subscription } from 'rxjs'

import { AdminPasswordDialog } from '../../../../shared/components/admin-password-dialog/admin-password-dialog'
import { NewIdentityDialog } from '../../../../shared/components/new-identity-dialog/new-identity-dialog'
import { QuitConfirmationDialog } from '../../../../shared/components/quit-confirmation-dialog/quit-confirmation-dialog'
import { Difficulty } from '../../../../shared/enums/difficulty.enum'
import { AdminAuthService } from '../../../../shared/services/admin-auth.service'
import { DifficultyService } from '../../../../shared/services/difficulty.service'
import { GlobalStore } from '../../../../state/global.store'
import { Stats } from '../stats/stats'

@Component({
	selector: 'app-header',
	imports: [Stats, QuitConfirmationDialog, NewIdentityDialog, AdminPasswordDialog, FormsModule, IonPopover, IonModal],
	templateUrl: './header.html',
	styleUrl: './header.scss',
})
export class Header implements OnInit, OnDestroy {
	readonly store = inject(GlobalStore)

	private readonly router = inject(Router)

	private readonly adminAuthService = inject(AdminAuthService)

	private readonly difficultyService = inject(DifficultyService)

	showStats = signal<boolean>(false)

	showQuitConfirmation = signal<boolean>(false)

	showNewIdentityDialog = signal<boolean>(false)

	showAdminPasswordDialog = signal<boolean>(false)

	showAdminOption = signal<boolean>(false)

	currentUrl = signal<string>(this.router.url)

	selectedDifficulty = signal<Difficulty>(this.difficultyService.getDifficulty())

	readonly Difficulty = Difficulty

	isAdminAuthenticated = computed(() => this.adminAuthService.isAuthenticated())

	@ViewChild(IonPopover)
	private usernamePopover?: IonPopover

	private readonly routerSubscription: Subscription

	// Show quit button when not on home page
	isHomePage = computed(() => {
		const url = this.currentUrl()
		return url === '/'
	})

	// Check if on gameplay page (classic or daily)
	isGameplayPage = computed(() => {
		const url = this.currentUrl()
		return url === '/classic' || url === '/daily' || url === '/play'
	})

	// Difficulty selector is irrelevant during daily gameplay (puzzle is fixed)
	isDailyGameplayPage = computed(() => {
		const url = this.currentUrl()
		return url === '/daily'
	})

	// Admin page for triad library and daily scheduling
	isManageTriadsPage = computed(() => {
		const url = this.currentUrl()
		return url === '/manage-triads'
	})

	constructor() {
		// Track route changes
		this.routerSubscription = this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
			if (event instanceof NavigationEnd) {
				this.currentUrl.set(event.urlAfterRedirects)
			}
		})
	}

	ngOnInit() {
		// Load difficulty from localStorage on component initialization
		this.selectedDifficulty.set(this.difficultyService.getDifficulty())
	}

	ngOnDestroy() {
		this.routerSubscription?.unsubscribe()
	}

	quitGame() {
		this.showQuitConfirmation.set(true)
	}

	confirmQuit() {
		this.store.resetGameState()
		this.router.navigate(['/'])
		this.showQuitConfirmation.set(false)
	}

	cancelQuit() {
		this.showQuitConfirmation.set(false)
	}

	toggleStatusWindow() {
		this.showStats.update((currentValue) => !currentValue)
	}

	closeStatsWindow() {
		this.showStats.set(false)
	}

	showHowToPlay() {
		this.store.setShowHowToPlay(true)
	}

	onUsernameTriggerClick(event: MouseEvent) {
		this.showAdminOption.set(event.ctrlKey || event.metaKey)
	}

	dismissUsernamePopover() {
		this.usernamePopover?.dismiss()
	}

	onUsernamePopoverWillPresent() {
		this.selectedDifficulty.set(this.difficultyService.getDifficulty())
	}

	onUsernamePopoverDidDismiss() {
		this.showAdminOption.set(false)
	}

	openStats() {
		this.showStats.set(true)
		this.dismissUsernamePopover()
	}

	openNewIdentity() {
		this.showNewIdentityDialog.set(true)
		this.dismissUsernamePopover()
	}

	closeNewIdentityDialog() {
		this.showNewIdentityDialog.set(false)
	}

	navigateToHome() {
		this.router.navigate(['/'])
	}

	openAdminPasswordDialog() {
		if (this.adminAuthService.isAuthenticated()) {
			this.navigateToManageTriads()
		} else {
			this.showAdminPasswordDialog.set(true)
			this.dismissUsernamePopover()
		}
	}

	navigateToManageTriads() {
		this.router.navigate(['/manage-triads'])
		this.dismissUsernamePopover()
	}

	onAdminAuthenticated() {
		this.showAdminPasswordDialog.set(false)
		this.navigateToManageTriads()
	}

	closeAdminPasswordDialog() {
		this.showAdminPasswordDialog.set(false)
	}

	onDifficultyChange(difficulty: Difficulty) {
		this.selectedDifficulty.set(difficulty)
		this.difficultyService.setDifficulty(difficulty)
	}
}

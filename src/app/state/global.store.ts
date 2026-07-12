import { inject } from '@angular/core'
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals'

import { GamePlayState } from '../pages/game-play/enums/game-play.enum'
import { SolvedTriad } from '../pages/game-play/interfaces/triad.interface'
import { TurnAndHint } from '../pages/game-play/interfaces/turn-and-hint.interface'
import { GAME_INTRO_DISMISSED_KEY } from '../shared/components/intro/intro-constant'
import { ClassicExtraQuotaInfo } from '../shared/interfaces/classic-extra.interface'
import { GlobalState } from '../shared/interfaces/global-state.interface'
import { User } from '../shared/interfaces/user.interface'
import { UserService } from '../shared/services/user.service'
import { runStatsSchemaMigrationIfNeeded } from '../shared/utils/stats-schema-migration.util'

function selectedCueSetsEqual(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false
	const sa = [...a].sort((x, y) => x.localeCompare(y))
	const sb = [...b].sort((x, y) => x.localeCompare(y))
	return sa.every((v, i) => v === sb[i])
}

function cueSetKey(cues: readonly string[]): string {
	return [...cues].sort((a, b) => a.localeCompare(b)).join('|')
}

function activeLetterHintsPresent(state: { keywordLengthHint: number | null; firstLetterHint: string | null }): boolean {
	return state.keywordLengthHint !== null || state.firstLetterHint !== null
}

function stashSnapshotIfNeeded(
	snapshots: GlobalState['triadHintSnapshots'],
	prevThree: string[],
	state: { keywordLengthHint: number | null; firstLetterHint: string | null; activeHintType: GlobalState['activeHintType'] },
): GlobalState['triadHintSnapshots'] {
	if (!activeLetterHintsPresent(state)) {
		return snapshots
	}
	return {
		...snapshots,
		[cueSetKey(prevThree)]: {
			keywordLengthHint: state.keywordLengthHint,
			firstLetterHint: state.firstLetterHint,
			activeHintType: state.activeHintType,
		},
	}
}

function restoredHintsForSelection(
	snapshots: GlobalState['triadHintSnapshots'],
	next: string[],
): {
	keywordLengthHint: number | null
	firstLetterHint: string | null
	activeHintType: GlobalState['activeHintType']
} {
	if (next.length !== 3) {
		return { keywordLengthHint: null, firstLetterHint: null, activeHintType: null }
	}
	const snap = snapshots[cueSetKey(next)]
	if (!snap) {
		return { keywordLengthHint: null, firstLetterHint: null, activeHintType: null }
	}
	return {
		keywordLengthHint: snap.keywordLengthHint,
		firstLetterHint: snap.firstLetterHint,
		activeHintType: snap.activeHintType,
	}
}

const initialState: GlobalState = {
	user: null,
	showHowToPlay: false,
	cues: null,
	finalTriadCues: null,
	selectedCues: [],
	turns: [
		{ id: 1, available: true, icon: 'images/turn-one.png' },
		{ id: 2, available: true, icon: 'images/turn-two.png' },
		{ id: 3, available: true, icon: 'images/turn-three.png' },
	],
	hints: [
		{ id: 1, available: true },
		{ id: 2, available: true },
	],
	gamePlayState: GamePlayState.IDLE,
	triadsStep: 'INITIAL',
	keywordLengthHint: null,
	firstLetterHint: null,
	activeHintType: null,
	triadHintSnapshots: {},
	usedHintTypes: [],
	solvedTriads: [],
	hintUsed: false,
	hintUsedWithOneTurnRemaining: false,
	isFetchingFinalTriadCues: false,
	isCheckingTriad: false,
	isCheckingAnswer: false,
	isFetchingHint: false,
	gameScore: 0,
	cuesToExplode: [],
	triadGroupId: null,
	unsolvedTriads: null,
	introShownPerSession: false,
	gameMode: 'classic',
	dailyNextPuzzleAt: null,
	dailyPuzzleDate: null,
	dailyStandaloneResult: false,
	dailyNoScheduleMessage: null,
	dailyReviewTriads: null,
	classicExtraQuota: null,
	isFinalClassicExtraSession: false,
}

export const GlobalStore = signalStore(
	{ providedIn: 'root' },
	withProps(() => ({
		userService: inject(UserService),
	})),
	withState(initialState),
	withMethods((store) => ({
		setUser: (user: User | null) => {
			patchState(store, (state) => ({ ...state, user }))
		},
		setShowHowToPlay: (value: boolean) => {
			patchState(store, (state) => ({ ...state, showHowToPlay: value }))
		},
		setCues: (cues: string[]) => {
			patchState(store, (state) => ({ ...state, cues: [...cues] }))
		},
		removeSolvedCues: (cues: string[]) => {
			patchState(store, (state) => ({ ...state, cues: state.cues?.filter((cue) => !cues.includes(cue)) }))
		},
		setFinalTriadCues: (triad: string[] | null) => {
			patchState(store, (state) => ({ ...state, finalTriadCues: triad }))
		},
		setSelectedCues: (selectedCues: string[]) => {
			patchState(store, (state) => {
				const prev = state.selectedCues
				const next = [...selectedCues]
				if (selectedCueSetsEqual(prev, next)) {
					return { ...state, selectedCues: next }
				}

				let snapshots = state.triadHintSnapshots
				if (prev.length === 3 && activeLetterHintsPresent(state)) {
					snapshots = stashSnapshotIfNeeded(snapshots, prev, state)
				}

				const { keywordLengthHint, firstLetterHint, activeHintType } = restoredHintsForSelection(snapshots, next)
				const switchedToDifferentThree = prev.length === 3 && next.length === 3 && !selectedCueSetsEqual(prev, next)

				return {
					...state,
					selectedCues: next,
					triadHintSnapshots: snapshots,
					keywordLengthHint,
					firstLetterHint,
					activeHintType,
					...(switchedToDifferentThree ? { usedHintTypes: [] as GlobalState['usedHintTypes'] } : {}),
				}
			})
		},
		addSelectedCue: (selectedCue: string) => {
			patchState(store, (state) => {
				const prev = state.selectedCues
				const next = [...state.selectedCues, selectedCue]
				if (selectedCueSetsEqual(prev, next)) {
					return { ...state, selectedCues: next }
				}

				let snapshots = state.triadHintSnapshots
				if (prev.length === 3 && activeLetterHintsPresent(state)) {
					snapshots = stashSnapshotIfNeeded(snapshots, prev, state)
				}

				const { keywordLengthHint, firstLetterHint, activeHintType } = restoredHintsForSelection(snapshots, next)

				return {
					...state,
					selectedCues: next,
					triadHintSnapshots: snapshots,
					keywordLengthHint,
					firstLetterHint,
					activeHintType,
				}
			})
		},
		removeSelectedCue: (selectedCue: string) => {
			patchState(store, (state) => {
				const prev = state.selectedCues
				const next = state.selectedCues.filter((cue) => cue !== selectedCue)
				if (selectedCueSetsEqual(prev, next)) {
					return { ...state, selectedCues: next }
				}

				let snapshots = state.triadHintSnapshots
				if (prev.length === 3 && activeLetterHintsPresent(state)) {
					snapshots = stashSnapshotIfNeeded(snapshots, prev, state)
				}

				const { keywordLengthHint, firstLetterHint, activeHintType } = restoredHintsForSelection(snapshots, next)

				return {
					...state,
					selectedCues: next,
					triadHintSnapshots: snapshots,
					keywordLengthHint,
					firstLetterHint,
					activeHintType,
				}
			})
		},
		clearTriadHintSnapshotForCues: (cues: string[]) => {
			patchState(store, (state) => {
				const key = cueSetKey(cues)
				if (!(key in state.triadHintSnapshots)) {
					return state
				}
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { [key]: _removed, ...rest } = state.triadHintSnapshots
				return { ...state, triadHintSnapshots: rest }
			})
		},
		setTurns: (turns: TurnAndHint[]) => {
			patchState(store, (state) => ({ ...state, turns: [...turns] }))
		},
		setHints: (hints: TurnAndHint[]) => {
			patchState(store, (state) => ({ ...state, hints: [...hints] }))
		},
		setGamePlayState(gamePlayState: GamePlayState) {
			patchState(store, (state) => ({ ...state, gamePlayState }))
		},
		updateTriadStep: (triadsStep: 'INITIAL' | 'FINAL') => {
			patchState(store, (state) => ({ ...state, triadsStep }))
		},
		setKeywordLengthHint: (keywordLengthHint: number | null) => {
			patchState(store, (state) => ({ ...state, keywordLengthHint }))
		},
		setFirstLetterHint: (firstLetterHint: string | null) => {
			patchState(store, (state) => ({ ...state, firstLetterHint }))
		},
		setActiveHintType: (activeHintType: 'KEYWORD_LENGTH' | 'FIRST_LETTER' | null) => {
			patchState(store, (state) => ({ ...state, activeHintType }))
		},
		setTriadHintSnapshots: (triadHintSnapshots: GlobalState['triadHintSnapshots']) => {
			patchState(store, (state) => ({ ...state, triadHintSnapshots: { ...triadHintSnapshots } }))
		},
		addUsedHintType: (hintType: 'KEYWORD_LENGTH' | 'FIRST_LETTER') => {
			patchState(store, (state) => {
				if (!state.usedHintTypes.includes(hintType)) {
					return { ...state, usedHintTypes: [...state.usedHintTypes, hintType] }
				}
				return state
			})
		},
		resetUsedHintTypes: () => {
			patchState(store, (state) => ({ ...state, usedHintTypes: [] }))
		},
		addSolvedTriad: (solvedTriad: SolvedTriad) => {
			patchState(store, (state) => ({ ...state, solvedTriads: [...state.solvedTriads, solvedTriad] }))
		},
		setHintUsage: (hintUsed: boolean) => {
			patchState(store, (state) => ({ ...state, hintUsed }))
		},
		setHintUsedWithOneTurnRemaining: (hintUsedWithOneTurnRemaining: boolean) => {
			patchState(store, (state) => ({ ...state, hintUsedWithOneTurnRemaining }))
		},
		setIsFetchingFinalTriadCues: (isFetchingFinalTriadCues: boolean) => {
			patchState(store, (state) => ({ ...state, isFetchingFinalTriadCues }))
		},
		setIsCheckingTriad: (isCheckingTriad: boolean) => {
			patchState(store, (state) => ({ ...state, isCheckingTriad }))
		},
		setIsCheckingAnswer: (isCheckingAnswer: boolean) => {
			patchState(store, (state) => ({ ...state, isCheckingAnswer }))
		},
		setIsFetchingHint: (isFetchingHint: boolean) => {
			patchState(store, (state) => ({ ...state, isFetchingHint }))
		},
		setGameScore: (gameScore: number) => {
			patchState(store, (state) => ({ ...state, gameScore }))
		},
		addCueToExplode: (cueToExplode: string) => {
			patchState(store, (state) => ({ ...state, cuesToExplode: [...state.cuesToExplode, cueToExplode] }))
		},
		setTriadGroupId: (triadGroupId: string | number | null) => {
			patchState(store, (state) => ({ ...state, triadGroupId }))
		},
		setUnsolvedTriads: (unsolvedTriads: SolvedTriad[] | null) => {
			patchState(store, (state) => ({ ...state, unsolvedTriads }))
		},
		resetGameState: () => {
			patchState(store, (state) => ({
				...state,
				cues: null,
				finalTriadCues: null,
				selectedCues: [],
				turns: [
					{ id: 1, available: true, icon: 'images/turn-one.png' },
					{ id: 2, available: true, icon: 'images/turn-two.png' },
					{ id: 3, available: true, icon: 'images/turn-three.png' },
				],
				hints: [
					{ id: 1, available: true },
					{ id: 2, available: true },
				],
				gamePlayState: GamePlayState.IDLE,
				triadsStep: 'INITIAL' as const,
				keywordLengthHint: null,
				firstLetterHint: null,
				activeHintType: null,
				triadHintSnapshots: {},
				usedHintTypes: [],
				solvedTriads: [],
				hintUsed: false,
				hintUsedWithOneTurnRemaining: false,
				isFetchingFinalTriadCues: false,
				isCheckingTriad: false,
				isCheckingAnswer: false,
				isFetchingHint: false,
				gameScore: 0,
				cuesToExplode: [],
				triadGroupId: null,
				unsolvedTriads: null,
				dailyNextPuzzleAt: null,
				dailyPuzzleDate: null,
				dailyStandaloneResult: false,
				dailyNoScheduleMessage: null,
				dailyReviewTriads: null,
				classicExtraQuota: null,
				isFinalClassicExtraSession: false,
			}))
		},
		setClassicExtraQuota: (classicExtraQuota: ClassicExtraQuotaInfo | null) => {
			patchState(store, (state) => ({ ...state, classicExtraQuota }))
		},
		setFinalClassicExtraSession: (isFinalClassicExtraSession: boolean) => {
			patchState(store, (state) => ({ ...state, isFinalClassicExtraSession }))
		},
		setIntroShownPerSession: (introShownPerSession: boolean) => {
			patchState(store, (state) => ({ ...state, introShownPerSession }))
		},
		setGameMode: (gameMode: 'classic' | 'daily' | 'standalone-classic') => {
			patchState(store, (state) => ({ ...state, gameMode }))
		},
		setDailyNextPuzzleAt: (dailyNextPuzzleAt: string | null) => {
			patchState(store, (state) => ({ ...state, dailyNextPuzzleAt }))
		},
		setDailyPuzzleDate: (dailyPuzzleDate: string | null) => {
			patchState(store, (state) => ({ ...state, dailyPuzzleDate }))
		},
		setDailyStandaloneResult: (dailyStandaloneResult: boolean) => {
			patchState(store, (state) => ({ ...state, dailyStandaloneResult }))
		},
		setDailyNoScheduleMessage: (dailyNoScheduleMessage: string | null) => {
			patchState(store, (state) => ({ ...state, dailyNoScheduleMessage }))
		},
		setDailyReviewTriads: (dailyReviewTriads: SolvedTriad[] | null) => {
			patchState(store, (state) => ({ ...state, dailyReviewTriads }))
		},
	})),
	withHooks({
		onInit(store) {
			runStatsSchemaMigrationIfNeeded()
			store.setUser(store.userService.getUser())
			store.setIntroShownPerSession(localStorage.getItem(GAME_INTRO_DISMISSED_KEY) === 'true')
		},
	}),
)

import { GamePlayState } from '../../pages/game-play/enums/game-play.enum'
import { SolvedTriad } from '../../pages/game-play/interfaces/triad.interface'
import { TurnAndHint } from '../../pages/game-play/interfaces/turn-and-hint.interface'
import { ClassicExtraQuotaInfo } from './classic-extra.interface'
import { User } from './user.interface'

/** Letter/length hints for a specific trio of cues (keyed by sorted cue set in the store). */
export interface TriadHintSnapshot {
	keywordLengthHint: number | null
	firstLetterHint: string | null
	activeHintType: 'KEYWORD_LENGTH' | 'FIRST_LETTER' | null
}

export interface GlobalState {
	user: User | null
	showHowToPlay: boolean
	cues: string[] | null
	isFetchingFinalTriadCues: boolean
	isCheckingTriad: boolean
	isCheckingAnswer: boolean
	isFetchingHint: boolean
	finalTriadCues: string[] | null
	selectedCues: string[]
	turns: TurnAndHint[]
	hints: TurnAndHint[]
	gamePlayState: GamePlayState
	triadsStep: 'INITIAL' | 'FINAL'
	keywordLengthHint: number | null
	firstLetterHint: string | null
	activeHintType: 'KEYWORD_LENGTH' | 'FIRST_LETTER' | null
	/** Hints keyed by `sorted cues` joined with `|` so they can be restored if the player re-selects the same three bubbles. */
	triadHintSnapshots: Record<string, TriadHintSnapshot>
	usedHintTypes: ('KEYWORD_LENGTH' | 'FIRST_LETTER')[]
	solvedTriads: SolvedTriad[]
	hintUsed: boolean
	hintUsedWithOneTurnRemaining: boolean
	gameScore: number
	cuesToExplode: string[]
	triadGroupId: string | number | null
	unsolvedTriads: SolvedTriad[] | null
	introShownPerSession: boolean
	gameMode: 'classic' | 'daily' | 'standalone-classic'
	dailyNextPuzzleAt: string | null
	dailyPuzzleDate: string | null
	dailyStandaloneResult: boolean
	dailyNoScheduleMessage: string | null
	dailyReviewTriads: SolvedTriad[] | null
	classicExtraQuota: ClassicExtraQuotaInfo | null
	/** True when the active Classic session consumed the last daily extra slot (game 3 of 3). */
	isFinalClassicExtraSession: boolean
}

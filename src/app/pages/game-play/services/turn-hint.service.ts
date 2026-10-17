import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'

import { GlobalStore } from '../../../state/global.store'
import { TurnAndHint } from '../interfaces/turn-and-hint.interface'

type HintExtra = 'KEYWORD_LENGTH' | 'FIRST_LETTER'

type HintOutcome = 'CORRECT' | 'FAIL'

/**
 * Game state is (T, H): T = available turns, H = available hints.
 *
 * Table rules:
 * - HINT ALLOWED?: Yes for (3,2), (2,2), (2,1), (1,2), (1,1). No for (1,0).
 * - ORGANIC FAIL (no hint used): T → T−1, H unchanged. If T=1 → game ends.
 * - HINT + CORRECT: T → T−1, H → H−1. Exception: when T=1, T stays 1, only H−1 (game continues).
 * - HINT + FAIL: T → T−1, H → H−1. If T=1 → game ends.
 */
@Injectable({
	providedIn: 'root',
})
export class TurnHintService {
	private readonly httpClient = inject(HttpClient)

	private readonly store = inject(GlobalStore)

	numberOfAvailableTurns(turns: TurnAndHint[]) {
		return turns.filter((turn) => turn.available).length
	}

	numberOfAvailableHints(hints: TurnAndHint[]) {
		return hints.filter((hint) => hint.available).length
	}

	/**
	 * Whether a hint can be used in the current (T, H) state.
	 * Hints allowed when T > 0 and H > 0; (1,0) is not allowed.
	 */
	canUseHint(turns: TurnAndHint[], hints: TurnAndHint[]) {
		const availableTurns = this.numberOfAvailableTurns(turns)
		const availableHints = this.numberOfAvailableHints(hints)
		return availableTurns > 0 && availableHints > 0
	}

	/**
	 * Consume one hint token; turns are updated later via applyHintOutcome.
	 * Using a hint always reduces H by 1; turn cost depends on outcome (correct/fail).
	 */
	useHintToken(hints: TurnAndHint[]) {
		const updatedHints = hints.map((hint) => ({ ...hint }))

		const indexToConsume = updatedHints.findIndex((hint) => hint.available)

		if (indexToConsume === -1) {
			throw new Error('No available hints to use')
		}

		updatedHints[indexToConsume].available = false
		return updatedHints
	}

	/**
	 * Apply organic fail (fail without using a hint).
	 * T → T−1, H unchanged. If T=1 → game ends.
	 */
	applyFailure(turns: TurnAndHint[], hints: TurnAndHint[]) {
		const currentTurns = this.numberOfAvailableTurns(turns)
		const hintUsed = this.store.hintUsed()
		const hintUsedWithOneTurnRemaining = this.store.hintUsedWithOneTurnRemaining()

		if (hintUsed) {
			if (hintUsedWithOneTurnRemaining) {
				const updatedTurns = this.setAvailableTurns(turns, 0)
				return { turns: updatedTurns, hints, gameEnds: true }
			}
			return { turns, hints, gameEnds: false }
		} else {
			if (currentTurns <= 0) {
				return { turns, hints, gameEnds: true }
			}

			if (currentTurns > 1) {
				const updatedTurns = this.setAvailableTurns(turns, currentTurns - 1)
				return { turns: updatedTurns, hints, gameEnds: false }
			}

			// currentTurns === 1 -> game ends
			const updatedTurns = this.setAvailableTurns(turns, 0)
			return { turns: updatedTurns, hints, gameEnds: true }
		}
	}

	/**
	 * Apply outcome after a hint was used (hint token already consumed).
	 * Hint+Correct: T→T−1, H already reduced; when T=1, T stays 1 (game continues).
	 * Hint+Fail: T→T−1, H already reduced; when T=1 → game ends.
	 */
	applyHintOutcome(turns: TurnAndHint[], hints: TurnAndHint[], outcome: HintOutcome) {
		const currentTurns = this.numberOfAvailableTurns(turns)

		if (currentTurns <= 0) {
			return { turns, hints, gameEnds: true }
		}

		if (currentTurns >= 2) {
			const updatedTurns = this.setAvailableTurns(turns, currentTurns - 1)
			return { turns: updatedTurns, hints, gameEnds: false }
		}

		// currentTurns === 1
		if (outcome === 'CORRECT') {
			// (1,2) -> (1,1), (1,1) -> (1,0): in both cases we already consumed the hint token,
			// so the remaining state is correct without changing turns here.
			return { turns, hints, gameEnds: false }
		}

		// outcome === 'FAIL' with one turn -> game ends
		const updatedTurns = this.setAvailableTurns(turns, 0)
		return { turns: updatedTurns, hints, gameEnds: true }
	}

	getHint(cues: string[], hintExtra?: HintExtra) {
		const params: { cues: string[]; with?: HintExtra; triadGroupId?: string | number; triadsStep?: string } = { cues }
		const triadGroupId = this.store.triadGroupId()
		if (triadGroupId) {
			params.triadGroupId = triadGroupId
			params.triadsStep = this.store.triadsStep()
		}

		if (hintExtra !== undefined) {
			params.with = hintExtra
		}

		return this.httpClient.get<{ hint: string[] | null; with?: string; withValue?: string }>('triads/hint', { params })
	}

	private setAvailableTurns(turns: TurnAndHint[], targetAvailable: number) {
		const updatedTurns = turns.map((turn) => ({ ...turn }))

		// Ensure a stable order: keep the first `targetAvailable` as available, the rest unavailable.
		let remaining = targetAvailable
		for (const turn of updatedTurns) {
			if (remaining > 0) {
				turn.available = true
				remaining -= 1
			} else {
				turn.available = false
			}
		}

		return updatedTurns
	}
}

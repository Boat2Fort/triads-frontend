import { Injectable } from '@angular/core'

import { TriadGroupFormData } from '../interfaces/triad-group.interface'
import { buildFourthTriadReceipt, formatFourthTriadReceipt } from './fourth-triad-receipt'

@Injectable({
	providedIn: 'root',
})
export class TriadValidationService {
	validateTriadGroup(data: TriadGroupFormData): { valid: boolean; errors: string[] } {
		const errors: string[] = []

		// Validate each triad has keyword and exactly 3 full phrases
		const triads = [
			{ name: 'Triad 1', triad: data.triad1 },
			{ name: 'Triad 2', triad: data.triad2 },
			{ name: 'Triad 3', triad: data.triad3 },
			{ name: 'Triad 4', triad: data.triad4 },
		]

		triads.forEach(({ name, triad }) => {
			// Check keyword exists
			if (!triad.keyword || triad.keyword.trim() === '') {
				errors.push(`${name}: Keyword is required`)
			}

			// Check exactly 3 full phrases exist
			if (!triad.fullPhrases || triad.fullPhrases.length !== 3) {
				errors.push(`${name}: Exactly 3 full phrases are required`)
			} else {
				// Check each full phrase is not empty
				triad.fullPhrases.forEach((fullPhrase, index) => {
					if (!fullPhrase || fullPhrase.trim() === '') {
						errors.push(`${name}: Word ${index + 1} is required`)
					}
				})

				// Check keyword is substring of each full phrase (case-insensitive)
				if (triad.keyword && triad.keyword.trim() !== '') {
					const keywordUpper = triad.keyword.trim().toUpperCase()
					triad.fullPhrases.forEach((fullPhrase, index) => {
						if (fullPhrase && fullPhrase.trim() !== '') {
							const fullPhraseUpper = fullPhrase.trim().toUpperCase()
							if (!fullPhraseUpper.includes(keywordUpper)) {
								errors.push(`${name}: Keyword "${triad.keyword}" must be a substring of Word ${index + 1} "${fullPhrase}"`)
							}
						}
					})
				}
			}
		})

		// The final triad must provide a one-to-one proof for the first three keywords.
		if (data.triad4.fullPhrases && data.triad4.fullPhrases.length === 3 && data.triad4.keyword.trim() !== '') {
			const keywords1to3 = [data.triad1.keyword, data.triad2.keyword, data.triad3.keyword].map((keyword) => keyword.trim()).filter(Boolean)

			if (keywords1to3.length === 3) {
				const receipt = buildFourthTriadReceipt(keywords1to3, {
					keyword: data.triad4.keyword.trim(),
					fullPhrases: data.triad4.fullPhrases.map((fullPhrase) => fullPhrase.trim()),
				})

				if (!receipt.valid) {
					errors.push(`Triad 4 receipt failed: ${formatFourthTriadReceipt(receipt)}`)
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		}
	}
}

import { TestBed } from '@angular/core/testing'

import { GlobalStore } from './global.store'

describe('GlobalStore triad hint identity', () => {
	let store: InstanceType<typeof GlobalStore>
	const a = ['PUSH-', 'CAMPAIGN', 'PANIC']
	const b = ['CARRIER', 'CLAY', 'STOOL']

	beforeEach(() => {
		localStorage.clear()
		TestBed.configureTestingModule({})
		store = TestBed.inject(GlobalStore)
		store.setSelectedCues(a)
		store.setFirstLetterHint('B')
		store.setActiveHintType('FIRST_LETTER')
		store.addUsedHintType('FIRST_LETTER')
	})

	afterEach(() => localStorage.clear())

	it('clears used hint types for a different triad selected one bubble at a time', () => {
		store.removeSelectedCue('PUSH-')
		store.setSelectedCues(b)
		expect(store.firstLetterHint()).toBeNull()
		expect(store.usedHintTypes()).toEqual([])
	})

	it('restores the same triad’s letter hint and used type after deselection and reordering', () => {
		store.setSelectedCues(b)
		store.setSelectedCues([...a].reverse())
		expect(store.firstLetterHint()).toBe('B')
		expect(store.usedHintTypes()).toEqual(['FIRST_LETTER'])
	})

	it('does not carry a pending hint outcome into a different triad', () => {
		store.setHintUsage(true)
		store.setHintUsedWithOneTurnRemaining(true)
		store.removeSelectedCue('PUSH-')
		expect(store.hintUsed()).toBeFalse()
		expect(store.hintUsedWithOneTurnRemaining()).toBeFalse()
	})

	it('does not recreate the solved triad’s snapshot when clearing its selection', () => {
		store.setSelectedCues(b)
		store.setSelectedCues(a)
		store.clearTriadHintSnapshotForCues(a)
		store.setSelectedCues([])
		expect(store.triadHintSnapshots()).toEqual({})
	})

	it('restores used types from older snapshots that only contain hint values', () => {
		store.setSelectedCues([])
		store.setTriadHintSnapshots({
			[a
				.slice()
				.sort((x, y) => x.localeCompare(y))
				.join('|')]: { firstLetterHint: 'B', keywordLengthHint: 6, activeHintType: 'KEYWORD_LENGTH' },
		})
		store.setSelectedCues(a)
		expect(store.usedHintTypes()).toEqual(['KEYWORD_LENGTH', 'FIRST_LETTER'])
	})
})

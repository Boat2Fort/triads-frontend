import { DOCUMENT } from '@angular/common'
import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core'

import { HighlightKeyPipe } from '../../../../shared/pipes/highlight-key.pipe'
import { GlobalStore } from '../../../../state/global.store'

@Component({
	selector: 'app-solution-reveal',
	imports: [HighlightKeyPipe],
	templateUrl: './solution-reveal.html',
	styleUrl: './solution-reveal.scss',
})
export class SolutionReveal {
	readonly store = inject(GlobalStore)

	private readonly document = inject(DOCUMENT)

	private readonly destroyRef = inject(DestroyRef)

	private readonly cardsContainer = viewChild<ElementRef<HTMLElement>>('cardsContainer')

	private readonly dismissed = signal(false)

	readonly unsolvedTriads = computed(() => this.store.unsolvedTriads())

	private readonly unsolvedTriadsKey = computed(() => {
		const triads = this.unsolvedTriads()
		if (!triads?.length) {
			return ''
		}
		return triads.map((triad) => triad.id).join(',')
	})

	readonly showSolutionReveal = computed(() => {
		const triads = this.unsolvedTriads()
		return triads !== null && triads.length > 0 && !this.dismissed()
	})

	constructor() {
		effect(() => {
			this.unsolvedTriadsKey()
			this.dismissed.set(false)
		})

		const onDocumentClick = (event: Event) => {
			const triads = this.unsolvedTriads()
			if (triads === null || triads.length === 0 || this.dismissed()) {
				return
			}
			const root = this.cardsContainer()?.nativeElement
			if (!root) {
				return
			}
			const target = event.target
			if (target instanceof Node && root.contains(target)) {
				return
			}
			// A bubbling click runs after the clicked control's handler, so one tap can
			// both perform the result action and dismiss the Solution Reveal.
			this.dismissed.set(true)
		}

		this.document.addEventListener('click', onDocumentClick)
		this.destroyRef.onDestroy(() => this.document.removeEventListener('click', onDocumentClick))
	}
}

import { Component, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { GlobalStore } from '../../../../state/global.store'
import { SolvedTriad } from '../../interfaces/triad.interface'
import { SolutionReveal } from './solution-reveal'

const FIRST_TRIAD: SolvedTriad = {
	id: 1,
	keyword: 'HAND',
	cues: ['SECOND', 'POKER', 'SHAKE'],
	fullPhrases: ['SECONDHAND', 'POKER HAND', 'HANDSHAKE'],
}

const SECOND_TRIAD: SolvedTriad = {
	id: 2,
	keyword: 'LINE',
	cues: ['DEAD', 'LAND', 'PIPE'],
	fullPhrases: ['DEADLINE', 'LANDLINE', 'PIPELINE'],
}

@Component({
	imports: [SolutionReveal],
	template: `
		<app-solution-reveal />
		<button type="button" data-testid="result-action" (click)="recordAction()">Result action</button>
		<div data-testid="background"></div>
	`,
})
class SolutionRevealHost {
	readonly actionCount = signal(0)

	recordAction() {
		this.actionCount.update((count) => count + 1)
	}
}

describe('SolutionReveal', () => {
	let fixture: ComponentFixture<SolutionRevealHost>
	let unsolvedTriads: ReturnType<typeof signal<SolvedTriad[] | null>>

	beforeEach(async () => {
		unsolvedTriads = signal([FIRST_TRIAD])

		await TestBed.configureTestingModule({
			imports: [SolutionRevealHost],
			providers: [{ provide: GlobalStore, useValue: { unsolvedTriads } }],
		}).compileComponents()

		fixture = TestBed.createComponent(SolutionRevealHost)
		fixture.detectChanges()
	})

	afterEach(() => fixture.destroy())

	it('runs an outside result action before dismissing the cards', () => {
		resultActionButton().click()
		fixture.detectChanges()

		expect(fixture.componentInstance.actionCount()).toBe(1)
		expect(solutionCard()).toBeNull()
	})

	it('keeps the cards visible when clicked inside a Solution Reveal card', () => {
		solutionCard()?.click()
		fixture.detectChanges()

		expect(solutionCard()).toBeTruthy()
	})

	it('dismisses the cards when the background is clicked', () => {
		background().click()
		fixture.detectChanges()

		expect(solutionCard()).toBeNull()
	})

	it('shows cards again for a new set of unsolved triads', async () => {
		background().click()
		fixture.detectChanges()
		expect(solutionCard()).toBeNull()

		unsolvedTriads.set([SECOND_TRIAD])
		await fixture.whenStable()
		fixture.detectChanges()

		expect(solutionCard()).toBeTruthy()
	})

	function solutionCard(): HTMLElement | null {
		return fixture.nativeElement.querySelector('app-solution-reveal .pointer-events-auto')
	}

	function resultActionButton(): HTMLButtonElement {
		return fixture.nativeElement.querySelector('[data-testid="result-action"]')
	}

	function background(): HTMLElement {
		return fixture.nativeElement.querySelector('[data-testid="background"]')
	}
})

import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { App } from './app'

describe('App', () => {
	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [App],
			providers: [provideRouter([])],
		}).compileComponents()
	})

	it('should create the app', () => {
		const fixture = TestBed.createComponent(App)
		const app = fixture.componentInstance
		expect(app).toBeTruthy()
	})

	it(`should have the 'Triads' title`, () => {
		const fixture = TestBed.createComponent(App)
		const app = fixture.componentInstance
		expect(app.title).toEqual('Triads')
	})

	it('should render the game router outlet', () => {
		const fixture = TestBed.createComponent(App)
		fixture.detectChanges()
		const compiled = fixture.nativeElement as HTMLElement
		expect(compiled.querySelector('ion-app ion-router-outlet')).not.toBeNull()
	})
})

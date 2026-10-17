import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { AgCharts } from 'ag-charts-angular'
import { firstValueFrom } from 'rxjs'

import { Stats } from './stats'

describe('Stats', () => {
	let component: Stats
	let fixture: ComponentFixture<Stats>

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [Stats],
		}).compileComponents()

		fixture = TestBed.createComponent(Stats)
		component = fixture.componentInstance
		fixture.detectChanges()
		// Let the renderer finish its first frame before TestBed tears it down.
		// AG Charts freezes its instance on destroy, so destroying mid-update logs
		// asynchronous errors unrelated to this component's smoke assertion.
		const chart = fixture.debugElement.query(By.directive(AgCharts)).componentInstance as AgCharts
		await firstValueFrom(chart.chartReady)
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

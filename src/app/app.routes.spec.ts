import { Routes } from '@angular/router'

import { mainRoutes, standaloneClassicRoutes } from './app.routes'
import { TriadManagementPage } from './pages/triad-management/triad-management.page'

function managementRoute(routes: Routes) {
	return routes[0].children?.find((route) => route.path === 'manage-triads')
}

describe('Triads management routes', () => {
	it('uses the same management page component in the Daily and Classic editions', () => {
		expect(managementRoute(mainRoutes)?.component).toBe(TriadManagementPage)
		expect(managementRoute(standaloneClassicRoutes)?.component).toBe(TriadManagementPage)
	})
})

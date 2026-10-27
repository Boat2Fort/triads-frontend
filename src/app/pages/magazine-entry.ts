import { HttpClient } from '@angular/common/http'
import { Component, inject, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { retry, timeout } from 'rxjs'

@Component({
	standalone: true,
	template: '<p class="p-6 text-center" role="status">Opening Triads...</p>',
})
export class MagazineEntry implements OnInit {
	private readonly http = inject(HttpClient)

	private readonly router = inject(Router)

	ngOnInit(): void {
		this.http
			.post('triads/daily/magazine/visit', {})
			.pipe(timeout(5000), retry(1))
			.subscribe({
				next: () => void this.router.navigateByUrl('/', { replaceUrl: true }),
				error: () => void this.router.navigateByUrl('/', { replaceUrl: true }),
			})
	}
}

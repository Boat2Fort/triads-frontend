import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { Observable } from 'rxjs'

import { Difficulty } from '../../../shared/enums/difficulty.enum'
import { TriadGroupFormData, TriadGroupResponse, TriadGroupStats } from '../interfaces/triad-group.interface'

@Injectable({
	providedIn: 'root',
})
export class TriadManagementApi {
	private readonly httpClient = inject(HttpClient)

	getTriadGroups(offset: number, limit: number, search?: string, difficulty?: Difficulty | null): Observable<TriadGroupResponse[]> {
		let params = new HttpParams().set('offset', offset.toString()).set('limit', limit.toString())

		if (search && search.trim()) {
			params = params.set('search', search.trim())
		}

		if (difficulty) {
			params = params.set('difficulty', difficulty)
		}

		return this.httpClient.get<TriadGroupResponse[]>('triads/groups', { params })
	}

	getTriadGroupStats(): Observable<TriadGroupStats> {
		return this.httpClient.get<TriadGroupStats>('triads/groups/stats')
	}

	createTriadGroup(data: TriadGroupFormData): Observable<TriadGroupResponse> {
		return this.httpClient.post<TriadGroupResponse>('triads/groups', data)
	}

	updateTriadGroup(id: number, data: TriadGroupFormData): Observable<TriadGroupResponse> {
		return this.httpClient.put<TriadGroupResponse>(`triads/groups/${id}`, data)
	}

	deleteTriadGroup(id: number): Observable<void> {
		return this.httpClient.delete<void>(`triads/groups/${id}`)
	}

	toggleTriadGroupStatus(id: number, active: boolean): Observable<TriadGroupResponse> {
		return this.httpClient.patch<TriadGroupResponse>(`triads/groups/${id}/status`, { active })
	}
}

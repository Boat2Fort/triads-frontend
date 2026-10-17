import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { firstValueFrom } from 'rxjs'

import { ApiError } from '../errors/api-error.model'
import { SnackbarService } from '../services/snackbar.service'
import { httpErrorsInterceptor } from './http-errors.interceptor'

describe('httpErrorsInterceptor', () => {
	let httpMock: HttpTestingController
	let snackbarService: jasmine.SpyObj<SnackbarService>

	beforeEach(() => {
		snackbarService = jasmine.createSpyObj('SnackbarService', ['showSnackbar'])

		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withInterceptors([httpErrorsInterceptor])),
				provideHttpClientTesting(),
				{ provide: SnackbarService, useValue: snackbarService },
			],
		})

		httpMock = TestBed.inject(HttpTestingController)
	})

	afterEach(() => {
		httpMock.verify()
	})

	it('should rethrow ApiError with backend message', async () => {
		const { HttpClient } = await import('@angular/common/http')
		const http = TestBed.inject(HttpClient)

		const promise = firstValueFrom(http.get('/test')).catch((error) => error)

		const req = httpMock.expectOne('/test')
		req.flush(
			{
				statusCode: 404,
				error: 'HTTP Error',
				data: { statusCode: 404, message: 'Triad group not found', error: 'Not Found' },
			},
			{ status: 404, statusText: 'Not Found' },
		)

		const error = await promise
		expect(error).toEqual(jasmine.any(ApiError))
		expect((error as ApiError).userMessage).toBe('Triad group not found')
	})

	it('should show deferred fallback toast when error is not handled', async () => {
		const { HttpClient } = await import('@angular/common/http')
		const http = TestBed.inject(HttpClient)

		const promise = firstValueFrom(http.get('/test')).catch((error) => error)

		const req = httpMock.expectOne('/test')
		req.flush(
			{
				statusCode: 400,
				error: 'HTTP Error',
				data: { statusCode: 400, message: 'Bad request payload', error: 'Bad Request' },
			},
			{ status: 400, statusText: 'Bad Request' },
		)

		await promise
		await new Promise<void>((resolve) => setTimeout(resolve, 0))

		expect(snackbarService.showSnackbar).toHaveBeenCalledWith('Bad request payload')
	})

	it('should suppress fallback toast when error is marked handled', async () => {
		const { HttpClient } = await import('@angular/common/http')
		const http = TestBed.inject(HttpClient)

		const promise = firstValueFrom(http.get('/test')).catch((error: ApiError) => {
			error.markHandled()
			return error
		})

		const req = httpMock.expectOne('/test')
		req.flush(
			{
				statusCode: 400,
				error: 'HTTP Error',
				data: { statusCode: 400, message: 'Handled locally', error: 'Bad Request' },
			},
			{ status: 400, statusText: 'Bad Request' },
		)

		await promise
		await new Promise<void>((resolve) => setTimeout(resolve, 0))

		expect(snackbarService.showSnackbar).not.toHaveBeenCalled()
	})
})

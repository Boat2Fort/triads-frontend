import { HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { catchError, throwError } from 'rxjs'

import { parseApiError } from '../errors/api-error.util'
import { SnackbarService } from '../services/snackbar.service'

export const httpErrorsInterceptor: HttpInterceptorFn = (req, next) => {
	const snackbarService = inject(SnackbarService)

	return next(req).pipe(
		catchError((caughtError) => {
			const apiError = parseApiError(caughtError)

			// Promise-based consumers must get a chance to mark the error handled.
			setTimeout(() => {
				if (!apiError.handled) {
					snackbarService.showSnackbar(apiError.userMessage)
				}
			}, 0)

			return throwError(() => apiError)
		}),
	)
}

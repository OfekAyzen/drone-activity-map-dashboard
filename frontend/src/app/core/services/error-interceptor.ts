import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const detail = error.error?.detail;
      const message = Array.isArray(detail)
        ? detail.map((item) => item.msg ?? JSON.stringify(item)).join('; ')
        : typeof detail === 'string'
          ? detail
          : `Request failed (${error.status})`;
      return throwError(() => new Error(message));
    }),
  );
};

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { trace } from '@opentelemetry/api';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const requestId = (req.headers['x-request-id'] as string) || `req_${randomUUID()}`;
    req.headers['x-request-id'] = requestId;

    const span = trace.getActiveSpan();
    const traceId = span?.spanContext().traceId;
    if (traceId) {
      const res = context.switchToHttp().getResponse();
      res.setHeader('x-trace-id', traceId);
    }

    return next.handle();
  }
}

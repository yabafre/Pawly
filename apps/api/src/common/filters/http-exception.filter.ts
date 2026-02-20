import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import type { ApiErrorResponse, ErrorType } from '@pawly/types';
import type { EnvConfig } from '@/config/index';

/**
 * Map HTTP status codes to error types
 */
function getErrorType(status: number): ErrorType {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 402) return 'payment';
  return 'server';
}

/**
 * Generate error code from status and context
 */
function getErrorCode(status: number): string {
  const statusMap: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
  };

  return statusMap[status] ?? `HTTP_${status}`;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly nodeEnv: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.nodeEnv = configService.get('NODE_ENV', { infer: true });
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Get request ID from header (set by interceptor) or generate one
    const requestId =
      (request.headers['x-request-id'] as string) || `req_${Date.now().toString(36)}`;

    // Determine status and message
    let status: number;
    let message: string;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message =
          (responseObj.message as string) || (responseObj.error as string) || 'An error occurred';

        // Extract validation details if present
        if (Array.isArray(responseObj.message)) {
          details = { validationErrors: responseObj.message };
          message = 'Validation failed';
        }
      } else {
        message = 'An error occurred';
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = this.nodeEnv === 'production' ? 'Internal server error' : exception.message;

      // Log full error in non-production
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code: getErrorCode(status),
        message,
        type: getErrorType(status),
        ...(details && { details }),
        requestId,
        timestamp: new Date().toISOString(),
      },
    };

    // Log error (non-5xx at debug level, 5xx at error level)
    if (status >= 500) {
      this.logger.error(`${request.method} ${request.path} - ${status} - ${message}`, {
        requestId,
        status,
      });
    } else {
      this.logger.debug(`${request.method} ${request.path} - ${status} - ${message}`, {
        requestId,
      });
    }

    response.status(status).json(errorResponse);
  }
}

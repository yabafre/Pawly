export type ErrorType = 'validation' | 'auth' | 'not_found' | 'payment' | 'server';

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    type: ErrorType;
    details?: Record<string, unknown>;
    requestId: string;
    timestamp: string;
  };
}

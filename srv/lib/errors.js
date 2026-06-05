class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
    this.details = details
    Error.captureStackTrace?.(this, this.constructor)
  }
}

class BadRequestError extends AppError {
  constructor(message, details = undefined) {
    super(400, 'bad_request', message, details)
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Missing or invalid API key') {
    super(401, 'unauthorized', message)
  }
}

class PayloadTooLargeError extends AppError {
  constructor(message = 'Request body is too large') {
    super(413, 'payload_too_large', message)
  }
}

function errorResponse(error) {
  return {
    error: {
      code: error.code || 'internal_error',
      message: error.message || 'Unexpected error',
      ...(error.details ? { details: error.details } : {})
    }
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  PayloadTooLargeError,
  errorResponse
}

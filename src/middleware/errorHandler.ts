import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Detailed logging in console for developer debugging
  console.error(`❌ [Finora API Error] ${req.method} ${req.originalUrl}:`, err);

  // 1. Zod Validation Error
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // 2. Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue ? err.keyValue[field] : '';
    return res.status(409).json({
      error: `Duplicate value error: ${field} '${value}' already exists.`,
    });
  }

  // 3. Mongoose Cast Error (Invalid ID format)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: `Invalid resource ID format: ${err.value}`,
    });
  }

  // 4. Fallback Generic Internal Server Error
  const statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : 500);
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    timestamp: new Date().toISOString(),
  });
}

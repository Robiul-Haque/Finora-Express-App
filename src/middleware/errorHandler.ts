import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  // 1. Zod Validation Error
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // 2. Custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 3. Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue ? err.keyValue[field] : '';
    res.status(409).json({
      success: false,
      error: `Duplicate value error: ${field} '${value}' already exists.`,
    });
    return;
  }

  // 4. Mongoose Cast Error (Invalid ID format)
  if (err.name === 'CastError') {
    res.status(400).json({
      success: false,
      error: `Invalid resource ID format: ${err.value}`,
    });
    return;
  }

  // 5. Fallback Internal Server Error
  const statusCode = Number(err.statusCode || err.status) || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`❌ [API Error] ${req.method} ${req.originalUrl}:`, err);

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  });
};

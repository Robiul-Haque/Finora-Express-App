import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

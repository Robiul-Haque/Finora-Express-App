import { Response } from 'express';

interface IResponseData<T> {
  statusCode: number;
  success?: boolean;
  message?: string;
  data?: T;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
    [key: string]: any;
  };
}

export const sendResponse = <T>(res: Response, responseData: IResponseData<T>): void => {
  const { statusCode, success = true, message, data, meta } = responseData;

  // When data is passed directly and caller expects standard JSON payload
  if (message === undefined && meta === undefined && (Array.isArray(data) || typeof data === 'object')) {
    res.status(statusCode).json(data);
    return;
  }

  res.status(statusCode).json({
    success,
    statusCode,
    ...(message && { message }),
    ...(meta && { meta }),
    ...(data !== undefined && { data }),
  });
};

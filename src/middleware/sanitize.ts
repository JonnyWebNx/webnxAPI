import sanitize from "mongo-sanitize";
import { Request, Response, NextFunction } from "express";

const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    req.query = sanitize(req.query);
    req.body = sanitize(req.body);
    next();
}

export default sanitizeInput;

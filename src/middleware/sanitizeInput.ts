import { Request, Response, NextFunction } from "express";
import { objectSanitize } from "../util/sanitize.js";

const sanitizeInput = (req: Request, _: Response, next: NextFunction) => {
    req.query = objectSanitize(req.query, false);
    req.body = objectSanitize(req.body, false);
    next();
}

export default sanitizeInput;

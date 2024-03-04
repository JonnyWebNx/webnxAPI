import jwt from 'jsonwebtoken'
import { ReqUser } from '../interfaces.js';
import { Request, Response, NextFunction } from 'express';
import config from '../config.js'
const { JWT_SECRET } = config

const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    // Get token from client request
    const token = req.headers["authorization"];
    // If no token
    if (!token) {
        return res.status(401).send("You must login to continue.");
    }
    try {
        // Decode user token
        const decoded = jwt.verify(token, JWT_SECRET!)
        req.user = decoded as unknown as ReqUser;
    } catch (err) {
        // If token is invalid
        return res.status(401).send("Login expired.");
    }
    return next();
}

export default verifyToken

import { UserSchema } from '../app/interfaces.js';
import User from '../model/user.js'
import { Request, Response, NextFunction } from 'express';

const kioskPermission = async (req: Request, res: Response, next: NextFunction) => {
    let user = await User.findById(req.user.user_id) as UserSchema
    if(user) {
        const { role } = user
        if(role == 'kiosk') {
            return next();
        }
        return res.status(403).send("Invalid permissions.");
    }
    return res.status(400).send("Invalid token.");
}

export default kioskPermission

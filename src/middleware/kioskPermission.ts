import { UserSchema } from '../app/interfaces.js';
import User from '../model/user.js'
import { Request, Response, NextFunction } from 'express';

const kioskPermission = async (req: Request, res: Response, next: NextFunction) => {
    const { role } = await User.findById(req.user.user_id) as UserSchema
    if(role == 'kiosk') {
        return next();
    }
    return res.status(403).send("Invalid permissions.");
}

export default kioskPermission

import { UserSchema } from '../app/interfaces.js';
import User from '../model/user.js'
import { Request, Response, NextFunction } from 'express';

const clerkAdminPermission = async (req: Request, res: Response, next: NextFunction) => {
    const { role } = await User.findById(req.user.user_id) as UserSchema
    if(role == 'admin'|| role =='inventory') {
        return next();
    }
    return res.status(403).send("Invalid permissions.");
}

export default clerkAdminPermission

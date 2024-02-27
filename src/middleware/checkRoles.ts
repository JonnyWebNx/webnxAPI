import { UserSchema } from '../interfaces.js'
import User from '../model/user.js'
import { Request, Response, NextFunction } from 'express';
import { MongooseError } from 'mongoose';

export default function checkRoles(allowed_roles: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        User.findById(req.user.user_id, (err: MongooseError, user: UserSchema)=>{
            if(err||!user.roles)
                return res.status(500).send("Error checking permissions");
            let user_roles = user.roles 
            // Check for overlap in user roles and route roles
            let overlappedRoles = allowed_roles.filter(value => user_roles.includes(value));
            // If overlap
            if(overlappedRoles.length > 0) {
                // Continue
                return next();
            }
            // No overlap - invalid permissions
            return res.status(403).send("Invalid permissions.");
        })
    }
}

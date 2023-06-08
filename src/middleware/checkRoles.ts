import { UserSchema } from '../app/interfaces.js'
import User from '../model/user.js'
import { PartQuery } from '../app/interfaces.js';
import { Request, Response, NextFunction } from 'express';

export default function checkRoles(allowed_roles: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        let user_roles = req.user.roles 
        // Check if user exists
        if(user_roles) {
            // Check for overlap in user roles and route roles
            let overlappedRoles = allowed_roles.filter(value => user_roles.includes(value));
            // If overlap
            if(overlappedRoles.length > 0) {
                // Continue
                return next();
            }
        }
        // No overlap - invalid permissions
        return res.status(403).send("Invalid permissions.");
    }
}

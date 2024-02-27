import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from "../model/user.js";
import handleError from "../util/handleError.js";
import { Request, Response } from "express";
import config from '../config.js'
import { UserSchema } from '../interfaces.js';
const { JWT_SECRET, JWT_EXPIRES_IN} = config

interface TokenUser extends UserSchema {
    token?: string
}

const login = async (req: Request, res: Response):Promise<void> => {
    try {
        // Get user input
        const { email, password } = req.body;
        // If email or password is blank
        if (!(email && password)) {
            res.status(400).send("All input is required.");
            return 
        }
        // Validate if user exists in database
        let user = await User.findOne({ email });
        // Compare password
        if (user&& user.password && (await bcrypt.compare(password, user.password))) {
            if(!user.enabled) {
                res.status(400).send("Your account is disabled.");
                return
            }
            // Create token if password correct
            let token = ""
            let tokenData = { user_id: user._id, email, building: user.building }
            // No expiry time for kiosk
            if (user.roles?.includes("is_kiosk")||user.roles?.includes("persist_login")) {
                token = jwt.sign(
                    tokenData,
                    JWT_SECRET!
                );
            }
            else {
                token = jwt.sign(
                    tokenData,
                    JWT_SECRET!,
                    {
                        expiresIn: JWT_EXPIRES_IN,
                    }
                );
            }
            // console.log(user.role+": "+token)
            // Turn user into JSON object
            let { password: pass, ...returnUser } = user as TokenUser
            // save token
            returnUser.token = token;
            // Send client user data
            res.status(200).json(returnUser);
            return 
        }
        // Invalid password
        res.status(400).send("Invalid Credentials");
    } catch (err) {
        handleError(err)
    }
}

export default login;

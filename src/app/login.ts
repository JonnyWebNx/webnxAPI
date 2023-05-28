import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from "../model/user.js";
import handleError from "../config/mailer.js";
import { Request, Response } from "express";
import config from '../config.js'
const { JWT_SECRET, JWT_EXPIRES_IN} = config

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
        if (user && (await bcrypt.compare(password, user.password))) {
            if(!user.enabled) {
                res.status(400).send("Your account is disabled.");
                return
            }
            // Create token if password correct
            let token = ""
            // No expiry time for kiosk
            if (user.role=="kiosk") {
                token = jwt.sign(
                    { user_id: user._id, email, role: user.role, building: user.building },
                    JWT_SECRET!
                );
            }
            else {
                token = jwt.sign(
                    { user_id: user._id, email, role: user.role, building: user.building },
                    JWT_SECRET!,
                    {
                        expiresIn: JWT_EXPIRES_IN,
                    }
                );
            }
            // console.log(user.role+": "+token)
            // Turn user into JSON object
            let { password: pass, ...returnUser } = user
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

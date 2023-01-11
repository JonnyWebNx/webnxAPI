import User from '../model/user.js'
import bcrypt from 'bcryptjs'
import jwt from "jsonwebtoken";
import handleError from "../config/mailer.js";
import { Request, Response } from "express";
import config from '../config.js'
const { JWT_EXPIRES_IN, JWT_SECRET} = config

const register = async (req: Request, res: Response) => {
    // register logic
    try {
        // Get user input
        const { first_name, last_name, email, password } = req.body;

        // Validate user input
        if (!(email && password && first_name && last_name)) {
            return res.status(400).send("All input is required");
        }

        // check if user already exists
        // Validate if user exists in our database
        const oldUser = await User.findOne({ email });

        if (oldUser) {
            return res.status(409).send("User already exists.  Please login.");
        }

        // Encrypt user password
        let encryptedPassword = await bcrypt.hash(password, 10);

        req.body.password = encryptedPassword
        delete req.body.password2
        console.log(req.body)

        // Create user in our database
        let user = await User.create({
            first_name,
            last_name,
            building: 3,
            email: email.toLowerCase(),
            password: encryptedPassword,
        }) as any;
        // Create token
        const token = jwt.sign(
            { user_id: user._id, email },
            JWT_SECRET!,
            {
                expiresIn: JWT_EXPIRES_IN,
            }
        );
        // Save user token 
        user.token = token;
        // Get rid of mongoose garbage and delete password
        let { password: pass, _doc: returnUser } = user
        delete returnUser.password
        return res.status(200).send(returnUser);
    } catch (err) {
        handleError(err)
    }
    // End register logic
}

export default register;

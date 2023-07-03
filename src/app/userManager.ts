/**
 * 
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Collection of functions for manipulating User entries in the database
 * 
 * 
 */
// Import user schema
import bcrypt from 'bcryptjs'
import User from '../model/user.js'
import { MongooseError } from 'mongoose';
import type { Request, Response } from 'express'
import { PartQuery, UserSchema } from './interfaces.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import handleError from '../config/handleError.js'
import nodemailer from 'nodemailer'
import { Options } from 'nodemailer/lib/mailer/index.js'
import config from '../config.js'
import crypto from 'crypto'
import resetToken from '../model/resetToken.js';

const {UPLOAD_DIRECTORY, EMAIL, EMAIL_PASS, JWT_SECRET} = config

// Main object containing functions
const userManager = {
    // Read
    getUser: async (req: Request, res: Response) => {
        try{
            // Make sure query string has id
            let id = req.query.id || req.user.user_id;
            // Find user in database
            User.findById(id, (err: MongooseError, user: UserSchema) => {
                if (err) {
                    res.status(500).send("API could not handle your request: "+err);        
                    return 
                }
                if(user){
                    // If user is found
                    // remove password from response
                    let { password, ...returnUser } = JSON.parse(JSON.stringify(user))
                    res.status(200).send(returnUser);
                    return 
                }
                // If user is not found
                res.status(400).send("User not found."); 
            });
        } catch(err) {
            // Database error
            res.status(500).send("API could not handle your request: "+err);
            return 
        }
    },
    getAllUsers: async (req: Request, res: Response) => {
        try{
            // Get all users
            let users = await User.find() as UserSchema[];
            let returnUsers = [] as UserSchema[]
            // Remove password from data
            for (let user of users){
                let { password, role, ...temp } = JSON.parse(JSON.stringify(user))
                returnUsers.push(temp)
            }
            // Success
            return res.status(200).json(returnUsers);
        } catch(err) {
            // Database error
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    // Update - id required in query string
    updateUser: async (req: Request, res: Response) => {
        try{
            if(!req.user.roles.includes("admin"))
                return res.status(403).send("Invalid permissions")
            // Check database to see if email already exists
            const submittedUser = req.body.user
            var emailExists = await User.findOne({email: submittedUser.email});
            if (emailExists&&submittedUser._id!=emailExists._id){
                // Email already exists in database and does not belong to user
                return res.status(409).send("Email taken.")
            }
            // Delete password from request
            delete submittedUser.password;
            // Send update query to database
            var user = await User.findByIdAndUpdate(submittedUser._id, submittedUser)
            if(user){
                // User was found and updated
                return res.status(200).send(`Updated user: ${user.email}`);
            }
            // User was not found
            return res.status(400).send("User not found.");
        } catch(err) {
            // Database error
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    sendPasswordResetEmail: async (req: Request, res: Response) => {
        let email = req.query.email
        let user = await User.findOne({email})
        if(!user)
            return res.status(400).send("User not found")
        // Check for existing token
        let existingToken = await resetToken.findOne({ userId: user._id })
        // Delete if one already exists
        if (existingToken)
            await resetToken.deleteOne(existingToken._id)
        // Create new token
        let newResetToken = crypto.randomBytes(32).toString("hex");
        // Create hash of token
        const hash = await bcrypt.hash(newResetToken, 10);
        // Create new token
        await resetToken.create({ userId: user._id, token: hash })
        
        let link = `https://inventory.webnx.com/passwordReset?token=${newResetToken}&userId=${user._id}`
        let transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: EMAIL,
                pass: EMAIL_PASS
            }
        });
        let mailOptions = {
            from: EMAIL,
            to: email,
            subject: `Password Reset`,
            text: `Here is a password reset link, it will expire in 1 hour.\n${link}`
        };
        transporter.sendMail(mailOptions as Options, function(err, info){
            transporter.close()
            if (err) {
                console.log(err)
                return res.status(500).send("Email failed to send.");
            }
            return res.status(200).send("Email sent.");
        }); 
    },
    updatePassword: async (req: Request, res: Response) => {
        // get password
        const { user_id, token, password } = req.body;
        try {
            if(!user_id||!password||!token)
                return res.status(400).send("Invalid request.");
            let user = await User.findById(user_id)
            let databaseToken = await resetToken.findOne({userId: user_id})
            // Check request
            if(!databaseToken)
                return res.status(400).send("Token expired or invalid.");
            if(!user)
                return res.status(400).send("User not found")
            // Check if token is valid
            let tokenValid = bcrypt.compare(token, databaseToken.token!)
            // Return if token invalid
            if(!tokenValid){
                return res.status(400).send("Invalid token.");
            }
            const encryptedPassword = await bcrypt.hash(password, 10);
            await User.findByIdAndUpdate(user_id, { password: encryptedPassword });
            await resetToken.findByIdAndDelete(databaseToken._id)
            return res.status(200).send("Success");
        } catch(err) {
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    // Delete - id required in query string
    deleteUser: async (req: Request, res: Response) => {
        // Get user id from query string
        if(!req.user.roles.includes("admin"))
            return res.status(403).send("Invalid permissions")
        var userToDelete = req.query.id;
        // Send id to database for deletion
        User.findByIdAndDelete(userToDelete, (err: MongooseError, user: UserSchema) => {
            if(err){
                // Database encountered error
                return res.status(500).send("API could not handle your request: "+err);
            } else if(!user){
                // User was not found
                return res.status(400).send("User not found.");
            }
            // User was successfully deleted
            return res.status(200).send(`Deleted: ${user.first_name} ${user.last_name}`);
        });
    },
    getUserImage: async (req: Request, res: Response) => {
        try {
            // Create path to image
            let imagePath = path.join(UPLOAD_DIRECTORY, 'images/users', `${req.params.id}.webp`)
            // Check if it exists and edit path if it doesn't
            if(!existsSync(imagePath))
                imagePath = path.join(UPLOAD_DIRECTORY, 'images', 'defaultUserImage.webp')
            // Send image
            res.sendFile(imagePath)
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    checkRoles: async (req: Request, res: Response) => {
        try {
            let user = User.findById(req.user.user_id) as UserSchema
            let user_roles = user.roles as string[]
            let allowed_roles = req.query.roles as string[]
            // Check for overlap
            if(allowed_roles.filter((r)=>user_roles.includes(r)).length>0)
                return res.status(200).send()
            return res.status(401).send()
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
}
export default userManager

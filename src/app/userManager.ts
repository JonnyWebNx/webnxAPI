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
import { UserSchema } from './interfaces.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import handleError from '../config/mailer.js'
import config from '../config.js'
const {UPLOAD_DIRECTORY} = config

// Main object containing functions
const userManager = {
    // Create
    // createUser: async (req: Request, res: Response) => {
    //     // Get required fields from request body
    //     let { first_name, last_name, email, password } = req.body;
    //     // Check if all required fields are filled
    //     if (!(first_name && last_name && email && password)){
    //         return res.status(400).send("Invalid request.")
    //     }
    //     // Check if email is already in use
    //     if (await User.findOne({ email })){
    //         return res.status(400).send("User already exists.");
    //     }
    //     // Encrypt user password
    //     let encryptedPassword  = await bcrypt.hash(password, 10);
    //     // Send user data to database
    //     User.create({first_name, last_name, email, password: encryptedPassword}, (err, user) => {
    //         // If database insertion fails
    //         if(err){
    //             return res.status(500).send("API could not handle your request: "+err);
    //         }
    //         // If user creation is successful
    //         return res.status(200).send(`Created user: ${user.first_name} ${user.last_name}`);
    //     })
    // },
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
            let users = await User.find();
            let returnUsers = [] as UserSchema[]
            // Remove password from data
            for (let user of users){
                let { password, ...temp } = JSON.parse(JSON.stringify(user))
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
            if(req.user.role!="admin")
                return res.status(403).send("Invalid p")
            // Check database to see if email already exists
            const submittedUser = req.body.user
            var emailExists = await User.findOne({email: submittedUser.email});
            if (emailExists&&submittedUser._id!=emailExists._id){
                // Email already exists in database and does not belong to user
                return res.status(409).send("Email taken.")
            }
            // Delete password from request
            delete req.body.password;
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
    // updatePassword: async (req: Request, res: Response) => {
    //     const { user_id } = req.user;
    //     // get password
    //     const { password } = req.body;
    //     try {
    //         if(!password){
    //             return res.status(400).send("Invalid request.");
    //         }
    //         const encryptedPassword = await bcrypt.hash(password, 10);
    //         let user = await User.findByIdAndUpdate(user_id, { password: encryptedPassword });
    //         if(user!=null){
    //             // remove password from response
    //             let { password, ...returnUser } = JSON.parse(JSON.stringify(user))
    //             return res.status(200).send(returnUser);
    //         }
    //         return res.status(400).send("User not found");
    //     } catch(err) {
    //         return res.status(500).send("API could not handle your request: "+err);
    //     }
    // },
    // Delete - id required in query string
    deleteUser: async (req: Request, res: Response) => {
        // Get user id from query string
        if(req.user.role != "admin")
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
    }
}
export default userManager

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
import { UserSchema, AssetUpdate } from './interfaces.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import handleError from '../config/handleError.js'
import nodemailer from 'nodemailer'
import { Options } from 'nodemailer/lib/mailer/index.js'
import config from '../config.js'
import crypto from 'crypto'
import resetToken from '../model/resetToken.js';
import PartRecord from '../model/partRecord.js'
import Asset from '../model/asset.js'
import { getAssetEvent } from './assetManager.js';
const { UPLOAD_DIRECTORY, EMAIL, EMAIL_PASS } = config

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
    },

    getUserCheckins: async (req: Request, res: Response) => {
        try {
            let { startDate, endDate, pageSize, pageNum, user } = req.query;
            // Parse page size and page num
            let pageSizeInt = parseInt(pageSize as string)
            let pageNumInt = parseInt(pageNum as string)
            // Turn date into usable objects
            let startDateParsed = new Date(parseInt(startDate as string))
            let endDateParsed = new Date(parseInt(endDate as string))
            endDateParsed.setDate(endDateParsed.getDate()+1)
            // Check for bad conversions
            if(isNaN(pageSizeInt)||isNaN(pageNumInt))
                return res.status(400).send("Invalid page number or page size");
            if(isNaN(startDateParsed.getTime())||isNaN(endDateParsed.getTime()))
                return res.status(400).send("Invalid start or end date");
            let pageSkip = pageSizeInt * (pageNumInt - 1)
            PartRecord.aggregate([
                {
                    // Get checkin queue
                    $match: { next: { $ne: null }, location: "Check In Queue", by: user, date_created: { $lte: endDateParsed, $gte: startDateParsed } } 
                },
                {
                    // GROUP BY DATE, USER, NXID, AND SERIAL
                    $group: {
                        _id: { date: "$date_created", by: "$by", nxid: "$nxid", serial: "$serial", next_owner: "$next_owner" },
                        // GET QUANTITY
                        quantity: { $sum: 1 } 
                    }
                },
                {
                    // GROUP BY DATA AND USER
                    $group: {
                        _id: { date: "$_id.date", by: "$_id.by" },
                        // PUSH NXID, SERIAL, AND QUANTITY to array
                        parts: { 
                            $push: { 
                                nxid: "$_id.nxid", 
                                serial: "$_id.serial", 
                                // Remove quantity for serialized
                                quantity: {
                                    $cond: [
                                        {$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"
                                    ]
                                },  
                                // IF next owner exists, part was denied
                                approved: {
                                    $cond: [ 
                                        {$eq: ["$_id.next_owner", "$arbitraryNonExistentField"]}, true, false
                                    ]
                                }
                            } 
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        date: "$_id.date",
                        by: "$_id.by",
                        parts: "$parts"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: {$sum: 1},
                        checkins: {$push: "$$ROOT"}
                    }
                },
                {
                    $project: {
                        _id: 0,
                        total: 1,
                        checkins: {$slice: ["$checkins", pageSkip, pageSizeInt]}
                    }
                }
            ]).exec((err, result)=>{
                if(err) {
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Return to client
                res.status(200).json(result.length&&result.length>0?result[0]:{total: 0, checkins: []});
            })
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getUserAssetUpdates: async (req: Request, res: Response) => {
        try {
            let { startDate, endDate, pageSize, pageNum, user } = req.query;
            // Parse page size and page num
            let pageSizeInt = parseInt(pageSize as string)
            let pageNumInt = parseInt(pageNum as string)
            // Turn date into usable objects
            let startDateParsed = new Date(parseInt(startDate as string))
            let endDateParsed = new Date(parseInt(endDate as string))
            endDateParsed.setDate(endDateParsed.getDate()+1)
            // Check for bad conversions
            if(isNaN(pageSizeInt)||isNaN(pageNumInt))
                return res.status(400).send("Invalid page number or page size");
            if(isNaN(startDateParsed.getTime())||isNaN(endDateParsed.getTime()))
                return res.status(400).send("Invalid start or end date");
            // Calculate page skip
            let pageSkip = pageSizeInt * (pageNumInt - 1)
            // Find added parts
            let assetUpdates = await PartRecord.aggregate([
                {
                    $match: {
                        by: user, 
                        date_created: {$gte: startDateParsed, $lte: endDateParsed},
                        asset_tag: { $ne: null },
                        prev: {$ne: null}
                    }
                },
                {
                    $group: {
                        _id: { asset_tag: "$asset_tag", date: "$date_created" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        asset_tag: "$_id.asset_tag",
                        date: "$_id.date"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ])  as AssetUpdate[]
            // Find removed parts
            assetUpdates = assetUpdates.concat(await PartRecord.aggregate([
                {
                    $match: {
                        next_owner: user, 
                        asset_tag: { $ne: null },
                        date_replaced: {$gte: startDateParsed, $lte: endDateParsed},
                    }
                },
                {
                    $group: {
                        _id: { asset_tag: "$asset_tag", date: "$date_replaced" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        asset_tag: "$_id.asset_tag",
                        date: "$_id.date"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ])  as AssetUpdate[])
            // Find updated assets
            assetUpdates = assetUpdates.concat(await Asset.aggregate([
                {
                    $match: {
                        by: user, 
                        date_created: {$gte: startDateParsed, $lte: endDateParsed},
                        prev: {$ne: null}
                    }
                },
                {
                    $group: {
                        _id: { asset_tag: "$asset_tag", date: "$date_created" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        asset_tag: "$_id.asset_tag",
                        date: "$_id.date"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ])  as AssetUpdate[])
            // Get all the dates of asset related events
            assetUpdates = assetUpdates
            .sort((a, b)=>{
                if (a.date < b.date)
                    return 1
                return -1
            })
            .filter((a, i, arr)=>{return i===arr.findIndex((b)=>{
                return b.date.getTime()==a.date.getTime()&&a.asset_tag==b.asset_tag
            })})
            
            let totalUpdates = assetUpdates.length
            let returnValue = await Promise.all(assetUpdates.splice(pageSkip, pageSizeInt).map((a)=>{
                return getAssetEvent(a.asset_tag, a.date)
            }))
            res.status(200).json({total: totalUpdates, pages: Math.ceil(totalUpdates/pageSizeInt),events: returnValue});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getUserNewAssets: async (req: Request, res: Response) => {
        try {
            let { startDate, endDate, pageSize, pageNum, user } = req.query;

            // Parse page size and page num
            let pageSizeInt = parseInt(pageSize as string)
            let pageNumInt = parseInt(pageNum as string)
            // Turn date into usable objects
            let startDateParsed = new Date(parseInt(startDate as string))
            let endDateParsed = new Date(parseInt(endDate as string))
            endDateParsed.setDate(endDateParsed.getDate()+1)
            // Check for bad conversions
            if(isNaN(pageSizeInt)||isNaN(pageNumInt))
                return res.status(400).send("Invalid page number or page size");
            if(isNaN(startDateParsed.getTime())||isNaN(endDateParsed.getTime()))
                return res.status(400).send("Invalid start or end date");
            // Calculate page skip
            let pageSkip = pageSizeInt * (pageNumInt - 1)
            Asset.aggregate([
                {
                    $match: {
                        $or: [{ prev: null}, {prev: {$exists: false}}],
                        by: user,
                        date_created: { $lte: endDateParsed, $gte: startDateParsed }
                    }
                },
                {
                    $sort: {
                        "date_created": -1
                    }
                },
                // Get total count
                {
                    $group: {
                        _id: null,
                        total: {$sum: 1},
                        updates: {$push: { asset_tag: "$asset_tag", date: "$date_created"}}
                    }
                },
                // Skip to page
                {
                    $project: {
                        _id: 0,
                        total: 1,
                        updates: {$slice: ["$updates", pageSkip, pageSizeInt]}
                    }
                }
            ]).exec(async (err, result: { total: number, updates: AssetUpdate[]}[])=>{
                if(err) {
                    return res.status(500).send("API could not handle your request: " + err);
                }
                if(result.length&&result.length>0) {
                    let returnValue = await Promise.all(result[0].updates!.map((a: AssetUpdate)=>{
                        return getAssetEvent(a.asset_tag, a.date)
                    }))
                    return res.status(200).json({total: result[0].total, pages: Math.ceil(result[0].total/pageSizeInt),events: returnValue});
                }
                // Return to client
                res.status(200).json({total: 0, pages: 1, events: []});
            })
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    }
}

export default userManager

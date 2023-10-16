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
import { isValidObjectId, MongooseError } from 'mongoose';
import type { Request, Response } from 'express'
import { UserSchema, AssetUpdate, CartItem, PartRecordSchema } from './interfaces.js';
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
import { getAssetEventAsync } from './methods/assetMethods.js';
import { getNumPages, getPageNumAndSize, getStartAndEndDate } from './methods/genericMethods.js';
import { isValidPartID } from './methods/partMethods.js';
const { UPLOAD_DIRECTORY, EMAIL, EMAIL_PASS } = config

export function getAllTechsDatesAsync(startDate: Date, endDate: Date, nxids?: string[]) {
    return new Promise<Date[]>(async (res)=>{
        let dates = [] as Date[]
        // Get parts added
        dates = dates.concat(await PartRecord.find({owner: "all", date_created: { $gte: startDate, $lte: endDate},
            nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
        }).distinct("date_created") as Date[])
        // Get parts removed
        dates = dates.concat(await PartRecord.find({owner: "all", date_replaced: { $gte: startDate, $lte: endDate},
            nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
        }).distinct("date_replaced") as Date[])
        // Sort dates
        dates = dates.sort((a: Date, b: Date) => { 
            if (a < b)
                return 1
            return -1
        })
        // Get rid of duplicates
        dates = dates
            .filter((d)=>d!=null)
            .map((d)=>d.getTime())
            .filter((date, index, arr) => arr.indexOf(date) === index && date != null)
            .map((d)=>new Date(d))
        res(dates)
    })
}

export function getAddedPartsAllTechsAsync(date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: { owner: "all", date_created: date,
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
            }
        },
        {
            $group: { 
                _id: { nxid: "$nxid", serial: "$serial", by: "$by" },
                quantity: { $sum: 1 }
            }
        },
        {
            $project: {
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                by: "$_id.by",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export function getRemovedPartsAllTechsAsync(date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: { owner: "all", date_replaced: date,
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
            }
        },
        {
            $group: { 
                _id: { nxid: "$nxid", serial: "$serial", next_owner: "$next_owner" },
                next: { $push: "$next" },
                quantity: { $sum: 1 }
            }
        },
        {
            $project: {
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                next_owner: "$_id.next_owner",
                next: "$next",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export function getExistingPartsAllTechsAsync(date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: { owner: "all", date_created: { $lt: date }, $or: [
                    {date_replaced: null}, 
                    {date_replaced: { $gt: date }}
                ],
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
            }
        },
        {
            $group: { 
                _id: { nxid: "$nxid", serial: "$serial" },
                quantity: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export function getPartEventDatesAsync(startDate: Date, endDate: Date, nxids?: string[]) {
    return new Promise<Date[]>(async (res)=>{
        let dates = await PartRecord.find({
            // Find new records in data range
            nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
            date_created: { $lte: endDate, $gte: startDate },
            $or: [
                {prev: null},
                {
                    $expr: {
                        $eq: [
                            {
                                $convert: {
                                    input: "$next",
                                    to: "objectId",
                                    onError: "bad"
                                }
                            },
                            "bad"
                        ]
                    }
                }
            ]
                
        }).distinct("date_created")
        dates = dates
            .filter((d)=>d!=null)
            .map((d)=>d.getTime())
            .filter((date, index, arr) => arr.indexOf(date) === index && date != null)
            .map((d)=>new Date(d))
            .sort((a, b)=>{
                if (a < b)
                    return 1
                return -1
            })
        res(dates)
    })
}

export function getPartsAddedAsync(date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
                date_created: date,
                prev: null
            }
        },
        {
            $group: { 
                _id: { nxid: "$nxid", serial: "$serial" },
                quantity: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}
export function getPartsRemovedAsync(date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
                date_created: date,
                $expr: {
                    $eq: [
                        {
                            $convert: {
                                input: "$next",
                                to: "objectId",
                                onError: "bad"
                            }
                        },
                        "bad"
                    ]
                }
            }
        },
        {
            $group: { 
                _id: { nxid: "$nxid", serial: "$serial" },
                quantity: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export function getPartEventAsync(date: Date, nxids?: string[]) {
    return new Promise<{ date: Date, info: PartRecordSchema, added: CartItem[], removed: CartItem[] }>(async (res)=>{
        // Try to get an added part
        let filterQ = await PartRecord.findOne({prev: null, date_created: date,
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
        })
        // If no added part
        if(!filterQ) {
            // Find a removed part
            filterQ = await PartRecord.findOne({date_created: date,
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
                $expr: {
                    $eq: [
                        {
                            $convert: {
                                input: "$next",
                                to: "objectId",
                                onError: "bad"
                            }
                        },
                        "bad"
                    ]
                }
            })
            // Get previous for filter details
            if(filterQ&&filterQ.prev)
                filterQ = await PartRecord.findById(filterQ.prev)
            else
                filterQ = {
                    pallet_tag: "ERROR",
                    owner: "ERROR",
                    location: "ERROR",
                    by: "ERROR"
                } as any
        }
        // Create filter
        let filter = {
            pallet_tag: filterQ && filterQ.pallet_tag ? filterQ.pallet_tag : undefined,
            asset_tag: filterQ && filterQ.asset_tag ? filterQ.asset_tag : undefined,
            owner: filterQ && filterQ.owner ? filterQ.owner : undefined,
            location: filterQ && filterQ.location ? filterQ.location : undefined,
            by: filterQ && filterQ.by ? filterQ.by : undefined

        }
        // Get added parts
        let added = await getPartsAddedAsync(date, nxids)
        // Get removed parts
        let removed = await getPartsRemovedAsync(date, nxids)
        // Return history event
        res({ date, info: filter, added, removed })
    })
}

export function getAllTechsEventAsync(date: Date, nxids?: string[]) {
    return new Promise<{by: string, date: Date, existing: CartItem[], added: CartItem[], removed: CartItem[]}>(async (res)=>{
        let existing = await getExistingPartsAllTechsAsync(date, nxids)
        let added = await getAddedPartsAllTechsAsync(date, nxids)
        let removed = await getRemovedPartsAllTechsAsync(date, nxids)
        let by = ""
        // Get by from added
        if(added.length>0) {
            // Loop through all just in case
            for(let part of added) {
                // Check if ID is valid
                if(isValidObjectId(part.by)) {
                    // Set by
                    by = part.by
                    // Break loop
                    break
                }
            }
        }
        // Get by from removed
        if(by==""&&removed.length>0) {
            // Loop until by is found
            for(let part of removed) {
                // Next owner is valid user
                if(isValidObjectId(part.next_owner)) {
                    by = part.next_owner
                    break
                }
                else {
                    // Control for breaking loop
                    let byFound = false
                    // Loop through aggregated next IDs
                    for(let n of part.next) {
                        // Try to find part
                        let rec = await PartRecord.findById(n)
                        // If found and is valid user
                        if(rec&&rec.by&&isValidObjectId(rec.by)) 
                        {
                            // Set variable
                            by = rec.by as string
                            // Set loop control to break outer loop
                            byFound = true
                            // Break this inner loop
                            break
                        }
                    }
                    // Break loop if found
                    if(byFound)
                        break
                    // Next owner
                }
            }
        }
        // Remove useless data
        added = added.map((p)=>{ return {nxid: p.nxid, serial: p.serial, quantity: p.quantity} })
        removed = removed.map((p)=>{ return {nxid: p.nxid, serial: p.serial, quantity: p.quantity} })
        // Return event
        res({by, date, existing, added, removed})
    })
}


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
        transporter.sendMail(mailOptions as Options, function(err){
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
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let user = req.query.user
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            PartRecord.aggregate([
                {
                    // Get checkin queue
                    $match: { next: { $ne: null }, location: "Check In Queue", by: user ? user : { $ne: null }, date_created: { $lte: endDate, $gte: startDate }, nxid: (nxids.length > 0 ? { $in: nxids } : { $ne: null })}
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
                        checkins: {$slice: ["$checkins", pageSkip, pageSize]}
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
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let user = req.query.user
            // Find added parts
            let assetUpdates = await PartRecord.aggregate([
                {
                    $match: {
                        by: user, 
                        date_created: {$gte: startDate, $lte: endDate},
                        asset_tag: { $ne: null },
                        //prev: {$ne: null}
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
                        date_replaced: {$gte: startDate, $lte: endDate},
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
                        date_created: {$gte: startDate, $lte: endDate},
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
            assetUpdates = assetUpdates
            .filter((a, i, arr)=>{return i===assetUpdates.findIndex((b)=>{
                return b.date.getTime()==a.date.getTime()&&a.asset_tag==b.asset_tag
            })})
            assetUpdates.map((a)=>{
                if(a.date.getTime()==1697134965341||a.date.getTime()==1697134965568)
                    console.log(a.asset_tag+": "+a.date.getTime())
            })
            let totalUpdates = assetUpdates.length
            
            let returnValue = await Promise.all(assetUpdates.splice(pageSkip, pageSize).map((a)=>{
                return getAssetEventAsync(a.asset_tag, a.date)
            }))
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates), events: returnValue});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getUserAssetUpdatesNoDetails: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let user = req.query.user
            // Find added parts
            let assetUpdates = await PartRecord.aggregate([
                {
                    $match: {
                        by: user, 
                        date_created: {$gte: startDate, $lte: endDate},
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
                        date_replaced: {$gte: startDate, $lte: endDate},
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
                        date_created: {$gte: startDate, $lte: endDate},
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
            assetUpdates = assetUpdates
            .splice(pageSkip, pageSize)
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates),events: assetUpdates});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getUserNewAssets: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let user = req.query.user
            Asset.aggregate([
                {
                    $match: {
                        $or: [{ prev: null}, {prev: {$exists: false}}],
                        by: user,
                        date_created: { $lte: endDate, $gte: startDate }
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
                        updates: {$slice: ["$updates", pageSkip, pageSize]}
                    }
                }
            ]).exec(async (err, result: { total: number, updates: AssetUpdate[]}[])=>{
                if(err) {
                    return res.status(500).send("API could not handle your request: " + err);
                }
                if(result.length&&result.length>0) {
                    let returnValue = await Promise.all(result[0].updates!.map((a: AssetUpdate)=>{
                        return getAssetEventAsync(a.asset_tag, a.date)
                    }))
                    return res.status(200).json({total: result[0].total, pages: getNumPages(pageSize, result[0].total),events: returnValue});
                }
                // Return to client
                res.status(200).json({total: 0, pages: 1, events: []});
            })
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getUserNewAssetsNoDetails: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let user = req.query.user
            Asset.aggregate([
                {
                    $match: {
                        $or: [{ prev: null}, {prev: {$exists: false}}],
                        by: user,
                        date_created: { $lte: endDate, $gte: startDate }
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
                        updates: {$slice: ["$updates", pageSkip, pageSize]}
                    }
                }
            ]).exec(async (err, result: { total: number, updates: AssetUpdate[]}[])=>{
                if(err) {
                    return res.status(500).send("API could not handle your request: " + err);
                }
                if(result.length&&result.length>0) {
                    return res.status(200).json({total: result[0].total, pages: getNumPages(pageSize, result[0].total),events: result[0].updates});
                }
                // Return to client
                res.status(200).json({total: 0, pages: 1, events: []});
            })
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getAllTechsHistory: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req);

            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))

            let dates = await getAllTechsDatesAsync(startDate, endDate, nxids)
            let totalEvents = dates.length
            dates = dates
                .splice(pageSkip, pageSize)
            // Get history
            let history = await Promise.all(dates.map((d)=>{
                return getAllTechsEventAsync(d, nxids)
            }))
            // Calculate num pages
            let pages = getNumPages(pageSize, totalEvents)
            // Return to client
            res.status(200).json({total: totalEvents, pages, events: history})
        }
        catch(err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getPartCreationAndDeletionHistory: async (req: Request, res: Response) => {
        // Get data from query
        let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
        nxids = nxids.filter((s)=>isValidPartID(s))
        let { pageSize, pageSkip } = getPageNumAndSize(req);
        let { startDate, endDate } = getStartAndEndDate(req);
        // Get event dates
        let dates = await getPartEventDatesAsync(startDate, endDate, nxids)
        // Total number of events
        let total = dates.length
        // Splice to page skip and size
        dates = dates
            .splice(pageSkip, pageSize)
        // Get history from map
        let history = await Promise.all(dates.map((d)=>getPartEventAsync(d, nxids)))
        // Return data
        res.status(200).json({total, numPages: getNumPages(pageSize, total), events: history})
    },
}

export default userManager

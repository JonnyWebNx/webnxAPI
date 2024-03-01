/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Part manager object for querying database and creating responses
 * 
 */
import Part from '../model/part.js'
import PartRecord from '../model/partRecord.js'
import Asset from '../model/asset.js'
import User from "../model/user.js";
import handleError from "../util/handleError.js";
import callbackHandler from '../util/callbackHandlers.js'
import { AssetSchema, BuildKitSchema, CartItem, CheckInQueuePart, InventoryEntry, NotificationTypes, PartRecordSchema, PartRequestSchema, UserSchema, PartSchema } from "../interfaces.js";
import mongoose, { CallbackError, isValidObjectId, MongooseError } from "mongoose";
import { Request, Response } from "express";
import path from 'path';
import config from '../config.js'
import fs from 'fs';
import {
    cartItemsValidAsync,
    kioskHasInInventoryAsync,
    sanitizeCartItems,
    cleansePart,
    getKiosksAsync,
    getKioskNamesAsync,
    getAllKioskNames,
    isValidPartID,
    getPartSearchRegex,
    returnPartSearch,
    sanitizeInventoryEntries,
    inventoryEntriesValidAsync,
    combineAndRemoveDuplicateCartItems,
} from '../methods/partMethods.js';
import { updatePartsAsync, updatePartsAddSerialsAsync, userHasInInventoryAsync, partRecordsToCartItems, getAddedAndRemovedCartItems, findExistingSerial, getAddedAndRemoved, updatePartsClearSerialsAsync } from '../methods/assetMethods.js';
import { getNumPages, getPageNumAndSize, getStartAndEndDate, getTextSearchParams, objectToRegex } from '../methods/genericMethods.js';
import { stringSanitize } from '../util/sanitize.js';
import PartRequest from '../model/partRequest.js';
import BuildKit from '../model/buildKit.js';
import { pushPayloadToRole, sendNotificationToGroup, sendNotificationToUser } from '../methods/notificationMethods.js';
const { UPLOAD_DIRECTORY } = config

const partManager = {
    // Create
    createPart: async (req: Request, res: Response) => {
        try {
            // Get part info from request body
            let { nxid, manufacturer, name, type, quantity } = req.body.part as PartSchema; 
            nxid = nxid ? nxid.toUpperCase() : '';

            let part = req.body.part as PartSchema
            // If any part info is missing, return invalid request
            if (!(nxid&&manufacturer&&name&&type)) {
                return res.status(400).send("Invalid request");
            }
            // Regex check the NXID
            if (!isValidPartID(nxid)) {
                return res.status(400).send("Invalid part ID");
            }
            // Try to add part to database
            let newPart = cleansePart(part)
            // Send part to database
            newPart.created_by = req.user.user_id;
            Part.create(newPart, async (err: MongooseError, part: PartSchema) => {
                if (err) {
                    // Return and send error to client side for prompt
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Shared create options
                let createOptions = {
                    nxid: part.nxid,
                    building: req.body.building ? req.body.building : req.user.building,
                    location: req.body.location ? req.body.location : "Parts Room",
                    by: req.user.user_id
                }
                let serials = [] as string[]
                if(req.body.part&&req.body.part.serials)
                    serials = req.body.part.serials as string[]
                let parts = [] as CartItem[]
                // If part is serialized, map serials to cart items
                if(part.serialized)
                    parts = serials.map((s)=>{return { nxid: part.nxid!, serial: s }})
                else
                    parts = [{nxid: part.nxid!, quantity}]
                // Migration mode creates new records instead of updating
                if(parts.length>0)
                    await updatePartsAsync(createOptions, {}, parts, true)
                // Succesful query
                return res.status(200).json(part);
            });
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    // Read
    getPart: async (req: Request, res: Response) => {
        try {
            // Destructure request
            let { pageSize, pageSkip } = getPageNumAndSize(req)
            delete req.query.pageNum
            delete req.query.pageSize
            delete req.query.location
            delete req.query.building
            delete req.query.advanced;
            // Typecast part
            let req_part = req.query
            // Create query part
            let search_part = objectToRegex(req_part)
            let numParts = await Part.count(search_part)
            let numPages = getNumPages(pageSize, numParts)
            Part.find(search_part)
                .skip(pageSkip)
                .limit(pageSize)
                .exec(returnPartSearch(numPages, numParts, req, res))
        } catch (err) {
            // Database error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPartByID: async (req: Request, res: Response) => {
        try {
            let part = {} as PartSchema
            let kiosks = await getKioskNamesAsync(req.user.building)
            // Check if NXID
            if (isValidPartID((req.query.id as string).toUpperCase())) {
                part = await Part.findOne({ nxid: { $eq: (req.query.id as string).toUpperCase() } }) as PartSchema;
            }
            // If mongo ID
            else {
                part = await Part.findById(req.query.id) as PartSchema
            }
            if(part==null) {
                return res.status(400).send("Part not found.");
            }
            // Get the total quantity
            let total_quantity = await PartRecord.count({
                nxid: part.nxid,
                next: null
            });
            // Get available quantity in specified building or location - use defaults from ternary if unspecified
            let quantity = await PartRecord.count({
                nxid: part.nxid,
                building: req.query.building ? req.query.building : req.user.building,
                location: req.query.location ? req.query.location : {$in: kiosks},
                next: null
            });
            // Get rid of unnecessary info
            part = part._doc;
            // Add quantities
            part.total_quantity = total_quantity;
            part.quantity = quantity;
            // return
            res.status(200).json(part);
        } catch (err) {
            // Database error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    createPartRequest: async (req: Request, res: Response) => {
        try {
            // Parse the cart items from the request
            let parts = sanitizeCartItems(req.body.parts)
            let notes = stringSanitize(req.body.notes, true)
            // Check if the cart items are valid
            if(!(await cartItemsValidAsync(parts)))
                return res.status(400).send("Error in requested parts")
            // Create the reqest in the db
            PartRequest.create({
                requested_by: req.user.user_id,
                building: req.user.building,
                date_created: Date.now(),
                parts,
                tech_notes: notes
                
            })
            .then(()=>{
                return sendNotificationToGroup('fulfill_part_requests', NotificationTypes.Alert, "There is a new part request.", "/clerk/partRequests")
            })
            .then(() => {
                res.status(200).send("Success")
            })
            .catch((err)=>{
                res.status(500).send("API could not handle your request: " + err);
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getActivePartRequests: async (req: Request, res: Response) => {
        try {

            let user_id = req.query.id

            PartRequest.find({
                date_fulfilled: null,
                cancelled: {$ne: true},
                requested_by: user_id ? user_id : {$ne: null}
            }, (err: MongooseError, requests: PartRequestSchema)=>{
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                res.status(200).send(requests)
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getFulfilledPartRequests: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            PartRequest.aggregate([
            {
                $match: {
                    date_fulfilled: { $lte: endDate, $gte: startDate },
                    $or: [
                        {requested_by: users && users.length > 0 ? { $in: users } : { $ne: null }},
                        {fulfilled_by: users && users.length > 0 ? { $in: users } : { $ne: null }}
                    ],
                }
            },
            {
                $sort: {
                    "date_fulfilled": -1
                }
            }
            ], (err: MongooseError, requests: PartRequestSchema[])=>{
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                res.status(200).send({total: requests.length, pages: getNumPages(pageSize, requests.length), events: requests.splice(pageSkip, pageSize)})
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    cancelPartRequest: async (req: Request, res: Response) => {
        try {
            let { id } = req.body
            if(id)
                PartRequest.findOneAndUpdate(
                    {
                        _id: id,
                        requested_by: req.user.user_id,
                        date_fulfilled: null,
                        cancelled: {$ne: true},
                    }, 
                    {
                        cancelled: true,
                        date_fulfilled: Date.now(),
                        fulfilled_by: req.user.user_id
                    }
                )
                .then(async (request)=>{
                    if(!request)
                        return res.status(400).send("Request not found")
                    await pushPayloadToRole('fulfill_part_requests', {
                        type: 'partRequestRemoved',
                        id: request._id
                    })
                    await sendNotificationToGroup('fulfill_part_requests', NotificationTypes.Alert, "A part request has been cancelled.")
                    if(request.build_kit_id)
                        await BuildKit.findByIdAndUpdate(request?.build_kit_id, {
                            requested_by: null,
                            date_requested: null
                        }, callbackHandler.callbackHandleError)
                    res.status(200).send("Success")
                })
                .catch((err)=>{
                    return res.status(500).send("API could not handle your request: " + err);
                })
            else
                res.status(400).send("Part request not found.");
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    processBuildKitRequest: async (req: Request, res: Response) => {
        // Get the ID
        let request_id = req.body.request_id as string
        // Eval approved or not
        let approved = eval(req.body.approved as string)
        let notes = req.body.notes as string
        // Check request
        if(!request_id||(approved!==true&&approved!==false))
            return res.status(400).send("Invalid request");
        // Find part request by ID
        let request = await PartRequest.findById(request_id)
        // If not found
        if(!request)
            return res.status(400).send("Build kit request not found");
        // If kit ID not present
        if(!request?.build_kit_id)
            return res.status(400).send("Part request does not contain build kit.");
        
        let current_date = Date.now();

        if(approved) {
            // Create options
            let createOptions = {
                owner: request?.requested_by,
                location: "Tech Inventory",
                building: req.user.building,
                by: req.user.user_id,
                next: null,
                date_created: current_date,
            }
            // Filter for part records
            let searchOptions = {
                next: null,
                kit_id: request?.build_kit_id!
            }
            // Get the records
            let records = await PartRecord.find(searchOptions)
            // Turn into cart items
            let cartItems = partRecordsToCartItems(records)
            // Find the build kit and update it
            BuildKit.findByIdAndUpdate(request.build_kit_id, {
                date_claimed: current_date,
                claimed_parts: cartItems,
                claimed_by: request?.requested_by
            })
            .then(()=>{
                return updatePartsAsync(createOptions, searchOptions, cartItems, false)
            })
            .then(()=>{
                return PartRequest.findByIdAndUpdate(request_id, {
                    fulfilled_by: req.user.user_id,
                    date_fulfilled: current_date,
                    fulfilled_list: [],
                    clerk_notes: notes
                })
            })
            .then(async (request)=>{
                await pushPayloadToRole('fulfill_part_requests', {
                    type: 'partRequestRemoved',
                    id: request!._id
                })
                return request
            })
            .then((request)=>{
                return sendNotificationToUser(request!.requested_by, NotificationTypes.Alert, "Your part request has been approved.", "/partRequests/fulfilled")
            })
            .then(()=>{
                res.status(200).send("Success")
            })
            .catch((err)=>{
                return res.status(500).send("API could not handle your request: " + err);
            })
        }
        else {
            BuildKit.findByIdAndUpdate(request?.build_kit_id, {
                requested_by: null,
                date_requested: null,
            })
            .then(()=>{
                return PartRequest.findByIdAndUpdate(request_id, {
                    fulfilled_by: req.user.user_id,
                    date_fulfilled: current_date,
                    clerk_notes: notes,
                    denied: true
                })
            })
            .then(async (request)=>{
                await pushPayloadToRole('fulfill_part_requests', {
                    type: 'partRequestRemoved',
                    id: request!._id
                })
                return request
            })
            .then((request)=>{
                return sendNotificationToUser(request!.requested_by, NotificationTypes.Alert, "Your part request has been denied.", "/partRequests/fulfilled")
            })
            .then(()=>{
                res.status(200).send("Success")
            })
            .catch((err)=>{
                return res.status(500).send("API could not handle your request: " + err);
            })
        }
    },

    fulfillPartRequest: async (req: Request, res: Response) => {
        try {
            let { request_id, list, notes, approved } = req.body
            approved = eval(approved)
            let current_date = Date.now();
            list = list as {kiosk: string, parts: InventoryEntry[]}[]
            // Create array for cart items
            let cartItems = [] as CartItem[]
            let serializedParts = [] as CartItem[]
            // Get part request
            let partRequest = await PartRequest.findById(request_id)
            // Return error if it does not exist
            if(!partRequest)
                return res.status(400).send("Part request not found")
            if(partRequest.cancelled)
                return res.status(400).send("Part request cancelled")
            if(partRequest.build_kit_id)
                return res.status(400).send("Incorrect API route")
            if(approved != true) {
                PartRequest.findByIdAndUpdate(request_id, {
                    fulfilled_by: req.user.user_id,
                    date_fulfilled: current_date,
                    clerk_notes: notes,
                    denied: true
                })
                .then(async (request)=>{
                    await pushPayloadToRole('fulfill_part_requests', {
                        type: 'partRequestRemoved',
                        id: request!._id
                    })
                    return request
                })
                .then((request)=>{
                    return sendNotificationToUser(request!.requested_by, NotificationTypes.Alert, "Your part request has been denied.", "/partRequests/fulfilled")
                })
                .then(()=>{
                    res.status(200).send("Success")
                })
                .catch((err)=>{
                    res.status(500).send("API could not handle your request: " + err);
                })
                return
            }
            // Use map to remove any dupes
            let listMap = new Map<string, InventoryEntry>()
            for(let entry of list) {
                listMap.set(entry.kiosk, entry.parts)
            }
            list = [] as {kiosk: string, parts: InventoryEntry[]}[]
            listMap.forEach((v, k)=>{
                list.push({kiosk: k, parts: v})
            })
            // save a copy for later
            let listCopy = JSON.parse(JSON.stringify(list))
            // Convert request parts to cart items
            for(let entry of list) {
                for(let p of entry.parts) {
                    cartItems.push({nxid: p.nxid, quantity: p.unserialized})
                    serializedParts = serializedParts.concat(p.newSerials.map((s: string)=>{
                        return {nxid: p.nxid, serial: s}
                    }))
                }
            }
            // Combine and remove duplicates
            cartItems = combineAndRemoveDuplicateCartItems(cartItems)
            // Check for differnce in parts list
            let diff = getAddedAndRemovedCartItems(cartItems, partRequest!.parts)
            // If there are differences or error in parsing, return error
            if(diff.added.length!=0||diff.removed.length!=0||diff.error)
                return res.status(400).send("Error in parts list.")
            // Check if any of the serial numbers already exist
            let serial = await findExistingSerial(serializedParts)
            if(serial!="")
                return res.status(400).send(`Serial ${serial} already exists.`)
            // Check if submission matches part request ✅
            list = list.filter((i: {kiosk: string, parts: InventoryEntry[]})=>i.kiosk!="Rejected")
            // Go through every entry and make sure kiosk has inv
            let kioskHasInventory = await Promise.all(list.map(async (item: {kiosk: string, parts: InventoryEntry[]})=>{
                let temp = item.parts.map((p)=>{
                    return { nxid: p.nxid, quantity: p.unserialized } as CartItem
                })
                let has = await kioskHasInInventoryAsync(item.kiosk, req.user.building, temp)
                return { has, item}
            }))
            // Check if any returned false
            for(let r of kioskHasInventory) {
                if(!r.has)
                    return res.status(400).send("Kiosk does not have enough parts.")
            }
            let createOptions = {
                owner: partRequest.requested_by,
                location: "Tech Inventory",
                building: partRequest.building,
                by: req.user.user_id,
                next: null,
                date_created: current_date,
            }
            // Update the parts
            await Promise.all(list.map((item: {kiosk: string, parts: InventoryEntry[]})=>{
                // Get parts from kiosk
                let searchOptions = {
                    next: null,
                    location: item.kiosk,
                    building: partRequest?.building
                }
                // Update em ayyyyyy
                return updatePartsAddSerialsAsync(createOptions, searchOptions, item.parts)
            }))
            // Update the request
            PartRequest.findByIdAndUpdate(request_id, {
                fulfilled_by: req.user.user_id,
                date_fulfilled: current_date,
                fulfilled_list: listCopy,
                clerk_notes: notes
            })
            .then(async (request)=>{
                await pushPayloadToRole('fulfill_part_requests', {
                    type: 'partRequestRemoved',
                    id: request!._id
                })
                return request
            })
            .then((request)=>{
                return sendNotificationToUser(request!.requested_by, NotificationTypes.Alert, "Your part request has been approved.", "/partRequests/fulfilled")
            })
            .then(()=>{
                res.status(200).send("Success")
            })
            .catch((err)=>{
                res.status(500).send("API could not handle your request: " + err);
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

//     createBuildTemplate: async (req: Request, res: Response) => {
// 
//     },
// 

    getBuildKitByID: async (req: Request, res: Response) => {
        try {
            let {id} = req.query
            BuildKit.findById(id, async (err: CallbackError, kit: BuildKitSchema) => {
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                let records = await PartRecord.find({kit_id: id, next: null})
                let items = partRecordsToCartItems(records)
                let returnKit = JSON.parse(JSON.stringify(kit))
                returnKit.parts = items
                res.status(200).json(returnKit)
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    createBuildKit: async (req: Request, res: Response) => {
        try{
            let { kit_name, parts, notes, kiosk } = req.body
            kit_name = stringSanitize(kit_name, true)
            notes = stringSanitize(notes, false)
            if(kit_name=="")
                return res.status(400).send(`Invalid kit name`)
            let existing_kit = await BuildKit.findOne({kit_name, date_claimed: null})
            if(existing_kit)
                return res.status(400).send(`Kit name already exists.`)
            let kioskUser = await User.findById(kiosk)
            if(!kioskUser||kioskUser.building!=req.user.building)
                return res.status(400).send(`Invalid kiosk selection.`)
            let current_date = Date.now();
            let list = parts as {kiosk: string, parts: InventoryEntry[]}[]
            // Create array for cart items
            let serializedParts = [] as CartItem[]
            // Use map to remove any dupes
            let listMap = new Map<string, InventoryEntry[]>()
            for(let entry of list) {
                listMap.set(entry.kiosk, entry.parts)
            }
            list = [] as {kiosk: string, parts: InventoryEntry[]}[]
            listMap.forEach((v, k)=>{
                list.push({kiosk: k, parts: v})
            })
            // Convert request parts to cart items
            for(let entry of list) {
                for(let p of entry.parts) {
                    serializedParts = serializedParts.concat(p.newSerials!.map((s: string)=>{
                        return {nxid: p.nxid, serial: s} as CartItem
                    }))
                }
            }
            // Check if any of the serial numbers already exist
            let serial = await findExistingSerial(serializedParts)
            if(serial!="")
                return res.status(400).send(`Serial ${serial} already exists.`)
            // Check if submission matches part request ✅
            list = list.filter((i: {kiosk: string, parts: InventoryEntry[]})=>i.kiosk!="Unsorted")
            // Go through every entry and make sure kiosk has inv
            let kioskHasInventory = await Promise.all(list.map(async (item: {kiosk: string, parts: InventoryEntry[]})=>{
                let temp = item.parts.map((p)=>{
                    return { nxid: p.nxid, quantity: p.unserialized } as CartItem
                })
                let has = await kioskHasInInventoryAsync(item.kiosk, req.user.building, temp)
                return { has, item}
            }))
            // Check if any returned false
            for(let r of kioskHasInventory) {
                if(!r.has)
                    return res.status(400).send("Kiosk does not have enough parts.")
            }

            BuildKit.create({
                kit_name,
                kiosk,
                building: req.user.building,
                date_created: current_date,
                created_by: req.user.user_id,
                notes
            }, async (err: CallbackError, kit: BuildKitSchema) => {
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                let createOptions = {
                    //owner: partRequest.requested_by,
                    kit_id: kit._id,
                    location: "Build Kit",
                    building: req.user.building,
                    by: req.user.user_id,
                    next: null,
                    date_created: current_date,
                    kiosk,
                }
                // Update the parts
                await Promise.all(list.map((item: {kiosk: string, parts: InventoryEntry[]})=>{
                    // Get parts from kiosk
                    let searchOptions = {
                        next: null,
                        location: item.kiosk,
                        building: req.user.building
                    }
                    // Update em ayyyyyy
                    return updatePartsAddSerialsAsync(createOptions, searchOptions, item.parts)
                }))
                return res.status(200).send("Success.")
            })

        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getBuildKits: async (req: Request, res: Response) => {
        try {
            function returnKitSearch(numPages: number, numKits: number, _: Request, res: Response) {
                return async (err: CallbackError, results: BuildKitSchema[]) => {
                    if(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    let kitsWithParts = await Promise.all(results.map(async (k)=>{
                        let returnKit = JSON.parse(JSON.stringify(k))
                        let parts = await loadPartsOnBuildKit(returnKit._id)
                        returnKit.parts = parts
                        return returnKit
                    }))
                    res.status(200).json({ pages: numPages, total: numKits, items: kitsWithParts});
                }
            }
            function getBuildKitRegex(searchString: string) {
                let keywords = [searchString]
                keywords = keywords.concat(searchString.split(" ")).filter((s)=>s!='')
                let searchOptions = [] as any
                let relevanceConditions = [] as any
                // Add regex of keywords to all search options
                keywords.map((key) => {
                    searchOptions.push({ "kit_name": { $regex: key, $options: "i" } })
                    relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$nxid", regex: new RegExp(key, "") } }, 5, -1] })
                    searchOptions.push({ "notes": { $regex: key, $options: "i" } })
                    relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$name", regex: new RegExp(key, "i") } }, 3, 0] })
                })
                return { regexKeywords: searchOptions, relevanceScore: relevanceConditions }
            }
            async function loadPartsOnBuildKit(kit_id: string) {
                let records = await PartRecord.find({kit_id})
                return partRecordsToCartItems(records)
            }
            // Get search string and page info
            let { pageSize, pageSkip, searchString } = getTextSearchParams(req)
            // If search string is empty
            if(searchString == "") {
                // Count all parts
                let numKits = await BuildKit.count({
                        date_claimed: null,
                        deleted: false
                    })
                // Calc number of pages
                let numPages = getNumPages(pageSize, numKits)
                // Get all parts
                BuildKit.find({
                        date_claimed: null,
                        deleted: false
                    })
                    // Sort by NXID
                    .sort({ date_created: -1 })
                    // Skip - gets requested page number
                    .skip(pageSkip)
                    // Limit - returns only enough elements to fill page
                    .limit(pageSize)
                    // Return search to user
                    .exec(returnKitSearch(numPages, numKits, req, res))
                return
            }
            // Get regex for aggregate search
            let { regexKeywords, relevanceScore } = getBuildKitRegex(searchString)
            // Use keywords to build search options
            let aggregateQuery = [
                {
                    $match: {
                        $or: regexKeywords,
                        date_claimed: null,
                        deleted: false
                    }
                },
                {
                    $addFields: {
                        relevance: {
                            $sum: relevanceScore
                        }
                    }
                },
                {
                    $sort: { relevance: -1 }
                },
                {
                    $project: { relevance: 0 }
                }
            ] as any
            // Aggregate count
            let countQuery = await BuildKit.aggregate(aggregateQuery).count("numParts")
            // This is stupid but it works
            let numKits = countQuery.length > 0&&countQuery[0].numParts ? countQuery[0].numParts : 0
            // Ternary that hurts my eyes
            let numPages = getNumPages(pageSize, numKits)
            // Search
            BuildKit.aggregate(aggregateQuery)
                .skip(pageSkip)
                .limit(pageSize)
                .exec(returnKitSearch(numPages, numKits, req, res))

        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    requestBuildKit: async (req: Request, res: Response) => {
        try {
            // Get kit id
            let kit_id = stringSanitize(req.body.kit_id, true)
            // Check if empty
            if(!kit_id)
                return res.status(400).send(`Kit id not present in request.`)
            // Find kit by id
            let kit = await BuildKit.findById(kit_id)
            // Check if kit was found
            if(!kit)
                return res.status(400).send(`Kit not found`)
            // Check if kit was claimed or deleted
            if(kit.date_claimed||kit.deleted)
                return res.status(400).send(`Kit has already been claimed or deleted`)
            // Check if kit has already been requested
            let existingRequest = await PartRequest.findOne({build_kit_id: kit_id, denied: {$ne: true}, cancelled: {$ne: true}})
            if(existingRequest)
                return res.status(400).send(`An active request already exists for this kit.`)
            let current_date = Date.now()
            BuildKit.findByIdAndUpdate(kit_id, {
                requested_by: req.user.user_id,
                date_requested: current_date
            }, (err: CallbackError, _: BuildKitSchema) => {
                // Error
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                // Create the part request
                PartRequest.create({
                    build_kit_id: kit_id,
                    requested_by: req.user.user_id,
                    building: req.user.building,
                    parts: [],
                    tech_notes: "",
                    date_created: current_date
                }, (err: CallbackError, _: PartRequestSchema) => {
                    // Error
                    if(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    // Send success
                    res.status(200).send("Kit requested.")
                })
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    claimBuildKit: async (req: Request, res: Response) => {
        try {
            let owner = ""
            let user = await User.findById(req.user.user_id)
            if(user&&user.roles?.includes("is_kiosk")) {
                user = await User.findById(req.body.user_id)
                if(!req.body.user_id)
                    return res.status(400).send(`User id not present in request.`)
                if(!user)
                    return res.status(400).send(`User does not exist.`)
                owner = user._id
            }
            else {
                owner = req.user.user_id as string
            }
            // Get kit id
            let kit_id = stringSanitize(req.body.kit_id, true)
            // Check if empty
            if(!kit_id)
                return res.status(400).send(`Kit id not present in request.`)
            // Find kit by id
            let kit = await BuildKit.findById(kit_id)
            // Check if kit was found
            if(!kit)
                return res.status(400).send(`Kit not found`)
            if(kit.date_claimed||kit.deleted)
                return res.status(400).send(`Kit cannot be claimed`)
            // Get current date for updates
            let current_date = Date.now()
            // Create options
            let createOptions = {
                owner,
                location: "Tech Inventory",
                building: req.user.building,
                by: req.user.user_id,
                next: null,
                date_created: current_date,
            }
            // Filter for part records
            let searchOptions = {
                next: null,
                kit_id
            }
            // Get the records
            let records = await PartRecord.find(searchOptions)
            // Turn into cart items
            let cartItems = partRecordsToCartItems(records)
            // Find the build kit and update it
            BuildKit.findByIdAndUpdate(kit_id, {
                date_claimed: current_date,
                claimed_parts: cartItems,
                claimed_by: owner
            }, async (err: CallbackError, _: BuildKitSchema) => {
                // Error
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                // Update the parts
                await updatePartsAsync(createOptions, searchOptions, cartItems, false)
                // Send success
                res.status(200).send("Kit claimed.")
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    deleteBuildKit: async (req: Request, res: Response) => {
        try {
            // Get kit id
            let kit_id = stringSanitize(req.body.kit_id, true)
            let list = req.body.parts as {kiosk: string, parts: CartItem[]}[]
            // Check if empty
            if(!kit_id)
                return res.status(400).send(`Kit id not present in request.`)
            // Find kit by id
            let kit = await BuildKit.findById(kit_id)
            // Check if kit was found
            if(!kit)
                return res.status(400).send(`Kit not found`)
            // 
            if(kit.date_claimed||kit.deleted)
                return res.status(400).send(`Kit cannot be deleted`)
            let current_date = Date.now();
            // save a copy for later
            let kiosks = await getAllKioskNames()
            // Cart items to check against the kit later
            let cartItems = [] as CartItem[]
            // Use these for quick dupe checks
            let kioskMap = new Map<string, any>()
            let serialMap = new Map<string, any>()
            // Loop through the whole list of kiosks
            for(let entry of list) {
                // Check if kiosk is valid
                if(!kiosks.includes(entry.kiosk))
                    return res.status(400).send(`Error in parts list.`)
                // Check if kiosk has already been used in array
                if(kioskMap.has(entry.kiosk))
                    return res.status(400).send(`Duplicate kiosk in request`)
                // Loop through all parts
                for(let p of entry.parts) {
                    // If no serial, skip
                    if(!p.serial)
                        continue
                    // If serial already has been used for part - return error
                    if(serialMap.has(p.nxid+p.serial))
                        return res.status(400).send(`Duplicate serial ${p.nxid}: ${p.serial} in request`)
                    // Add serial to hash map
                    serialMap.set(p.nxid+p.serial, {})
                }
                // Add kiosk to hash map
                kioskMap.set(entry.kiosk, {})
                // Add the list to the cart items without kiosk
                cartItems = cartItems.concat(entry.parts)
            }
            // Combine and remove duplicates (there should be no duplicates, just combines)
            cartItems = combineAndRemoveDuplicateCartItems(cartItems)
            // Get the part records associated with the kit
            let kit_records = await PartRecord.find({kit_id, next: null})
            // Check if lists match
            let { added, removed, error } = getAddedAndRemoved(cartItems, kit_records)
            if(added.length>0 || removed.length>0 || error)
                return res.status(400).send(`Error in parts list.`)
            // Update the parts
            await Promise.all(list.map((item: {kiosk: string, parts: CartItem[]})=>{
                let createOptions = {
                    next: null,
                    location: item.kiosk,
                    building: req.user.building,
                    by: req.user.user_id,
                    date_created: current_date,
                }
                // Get parts from kiosk
                let searchOptions = {
                    next: null,
                    kit_id
                }
                // Update em ayyyyyy
                return updatePartsClearSerialsAsync(createOptions, searchOptions, item.parts, false)
            }))
            // Update the request
            BuildKit.findByIdAndUpdate(kit_id, {
                deleted: true,
                deleted_by: req.user.user_id,
                deleted_parts: list,
                date_deleted: current_date,
            }, async (err: MongooseError, _: BuildKitSchema) =>{
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                let partRequests = await PartRequest.find({build_kit_id: kit_id})
                for(let pr of partRequests) {
                    PartRequest.findByIdAndUpdate(pr._id!, {
                        fulfilled_by: req.user.user_id,
                        date_fulfilled: current_date,
                        clerk_notes: "Build kit was deleted.",
                        denied: true
                    })
                    .then(()=>{
                        return pushPayloadToRole('fulfill_part_requests', {
                            type: 'partRequestRemoved',
                            id: pr._id
                        })
                    })
                    .catch(()=>{
                        handleError(err)
                    })
                }
                res.status(200).send("Success")
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getKioskQuanitities: async (req: Request, res: Response) => {
        try {
            // Parse the cart items from the request
            let nxids = Array.isArray(req.query.part) ? req.query.part as [] : [req.query.part]
            // Check if the cart items are valid
            let kiosks = await getAllKioskNames()
            PartRecord.aggregate([
                {
                    $match: {
                        nxid: {$in: nxids},
                        location: {$in: kiosks},
                        building: req.user.building,
                        next: null
                    }
                },
                {
                    $group: { 
                        _id: { nxid: "$nxid", location: "$location" },
                        quantity: { $sum: 1 }
                    }
                },
                {
                    $group: {
                        _id: "$_id.nxid",
                        kiosk_quantities: {
                            $push: {
                                kiosk: "$_id.location",
                                quantity: "$quantity",
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        nxid: "$_id",
                        kiosk_quantities: "$kiosk_quantities"
                    }
                },
            ], (err: CallbackError, result: any[])=>{
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                res.status(200).send(result)
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    checkout: async (req: Request, res: Response) => {
        try {
            let { user_id, cart } = req.body
            
            let user = await User.findById(user_id).exec()
            if(user_id==null||user_id==undefined||user==null)
                return res.status(400).send("Invalid request")
            let current_date = Date.now();
            // Find each item and check quantities before updating
            let kiosk = await User.findById(req.user.user_id)
            let kioskName = kiosk?.first_name + " " + kiosk?.last_name

            cart = cart as InventoryEntry[]
            let cartItems = [] as CartItem[]
            let serializedParts = [] as CartItem[]
            for(let p of cart) {
                cartItems.push({nxid: p.nxid, quantity: p.unserialized})
                serializedParts = serializedParts.concat(p.newSerials.map((s: string)=>{
                    return {nxid: p.nxid, serial: s}
                }))
            }

            // Combine and remove duplicates
            cartItems = combineAndRemoveDuplicateCartItems(cartItems)

            if(!kioskHasInInventoryAsync(kioskName, req.user.building, cartItems))
                return res.status(400).send("Items not found in kiosk inventory")

            let createOptions = {
                owner: user_id,
                location: "Tech Inventory",
                building: req.user.building,
                by: req.user.user_id,
                next: null,
                date_created: current_date,
            }
            // Get parts from kiosk
            let searchOptions = {
                next: null,
                location: kioskName,
                building: req.user.building
            }
            // Update part records
            await updatePartsAddSerialsAsync(createOptions, searchOptions, cart)
            // Success
            res.status(200).send("Successfully checked out.")
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    checkin: async (req: Request, res: Response) => {
        try {
            let { user_id, inventory } = req.body
            // Make sure user is valid of 'all' as in
            // All Techs
            let current_date = Date.now();
            if(user_id!='all'&&user_id!='testing') {
                let user = await User.findById(user_id).exec()
                if(user_id==null||user_id==undefined||user==null)
                    return res.status(400).send("Invalid request")
            }
            // Santizie cart items
            inventory = sanitizeCartItems(inventory)
            // Check if inventory items are valid
            if(!(await cartItemsValidAsync(inventory)))
                return res.status(400).send("Error in checkin items")
            // Check if user has items in inventory
            if(!(await userHasInInventoryAsync(user_id, inventory)))
                return res.status(400).send("Items not found in user inventory")
            // Iterate through each item and update records
            let createOptions = {
                next: null,
                location: "Check In Queue",
                building: req.user.building,
                by: user_id,
                date_created: current_date,
            }
            let searchOptions = {
                next: null,
                owner: user_id,
            }
            await updatePartsAsync(createOptions, searchOptions, inventory, false)
            await sendNotificationToGroup('process_checkins', NotificationTypes.Alert, "There is a new check in request.", "/clerk/checkin")
            // Success
            res.status(200).send("Successfully checked in.")
        }
        catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getCheckinQueue: async (req: Request, res: Response) => {
        try {
            PartRecord.aggregate([
                {
                    // Get checkin queue
                    $match: { next: null, location: "Check In Queue", building: req.user.building } 
                },
                {
                    // GROUP BY DATE, USER, NXID, AND SERIAL
                    $group: {
                        _id: { date: "$date_created", by: "$by", nxid: "$nxid", serial: "$serial" },
                        // GET QUANTITY
                        quantity: { $sum: 1 } 
                    }
                },
                {
                    // GROUP BY DATA AND USER
                    $group: {
                        _id: { date: "$_id.date", by: "$_id.by" },
                        // PUSH NXID, SERIAL, AND QUANTITY to array
                        parts: { $push: { nxid: "$_id.nxid", serial: "$_id.serial", quantity: "$quantity" } }
                    }
                },
                {
                    $sort: {
                        "_id.date": -1
                    }
                },
            ]).exec((err, result)=>{
                if(err) {
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Restructure aggregate response 
                let requestQueue = result.map((r)=>{
                    // Remove quantity from serialized
                    let mappedParts = r.parts.map((p: CartItem)=>{
                        if(p.serial)
                            return { nxid: p.nxid, serial: p.serial}
                        return p
                    })
                    // Remove _id layer
                    return {
                        date: r._id.date,
                        by: r._id.by,
                        parts: mappedParts
                    }
                })
                // Return to client
                res.status(200).json(requestQueue);
            })
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    processCheckinRequest: async (req: Request, res: Response) => {
        try {
            // Check info from checkin request
            let { date, by } = req.body
            // SANITIZE
            let parts = req.body.parts as CheckInQueuePart[]
            // Remove duplicates
            parts = parts.filter((item, index, arr)=>index==arr.findIndex((a)=>{
                return (a.nxid == item.nxid)&&(a.serial==item.serial)
            }))
            // Check if anything is missing
            if(!date||!by||!parts)
                return res.status(400).send("Invalid request")
            // Get kiosks
            let kioskReq = await getKiosksAsync(req.user.building)
            // Create hash map
            let kiosks = new Map<string, UserSchema>()
            // Convert to hash
            for (let k of kioskReq) {
                kiosks.set(k.first_name + " " + k.last_name, k)
            }
            // Validate all parts
            for (let i = 0; i < parts.length; i++) {
                // Check if approved or denied
                if(parts[i].approved==undefined&&parts[i].approvedCount==undefined)
                    return res.status(400).send(parts[i].nxid + " has not been approved or denied")
                // Check if approved part has location
                if((parts[i].approved||(parts[i].approvedCount&&parts[i].approvedCount!>0))&&(!parts[i].newLocation||!kiosks.has(parts[i].newLocation!)))
                    return res.status(400).send(parts[i].nxid + " does not have a valid location")
                // Count parts in queue
                let partCounts = await PartRecord.count({
                    nxid: parts[i].nxid, 
                    next: null, 
                    location: "Check In Queue", 
                    date_created: date,
                    building: req.user.building,
                    by: by,
                    serial: parts[i].serial
                })
                // Check quanitites
                if((parts[i].serial&&partCounts!=1)||(parts[i].quantity&&parts[i].quantity!=partCounts)||(parts[i].approvedCount&&parts[i].approvedCount!>partCounts))
                    return res.status(400).send(parts[i].nxid + " does not have a valid quantity or serial")
            }
            // Get current date for updates
            let current_date = Date.now()
            // Find part records in request
            await Promise.all(parts.map(async (p)=>{
                // Check if serialized
                let searchOptions = {
                    nxid: p.nxid, 
                    next: null, 
                    location: "Check In Queue", 
                    date_created: date,
                    building: req.user.building,
                    by: by,
                    serial: p.serial
                }
                let approvedOptions = {
                    nxid: p.nxid,
                    next: null,
                    location: p.newLocation,
                    // Clear serial when checked in
                    // serial: p.serial,
                    building: req.user.building,
                    by: req.user.user_id,
                    date_created: current_date,
                } as PartRecordSchema
                let deniedOptions = {
                    nxid: p.nxid,
                    owner: by,
                    location: "Tech Inventory",
                    serial: p.serial,
                    building: req.user.building,
                    by: req.user.user_id,
                    next: null,
                    date_created: current_date,
                } as PartRecordSchema
                if(p.serial) {
                    // Find one
                    let partToUpdate = await PartRecord.findOne(searchOptions)
                    approvedOptions.prev = partToUpdate!._id
                    deniedOptions.prev = partToUpdate!._id
                    // Create new iteration
                    // If not approved
                    if(p.approved==true)
                        PartRecord.create(approvedOptions, callbackHandler.updateRecord)
                    else
                        PartRecord.create(deniedOptions, callbackHandler.updateRecord)
                    return
                }
                // Find all matching records
                let partsToUpdate = await PartRecord.find(searchOptions)
                // Update all approved records
                for (let i = 0; i < p.approvedCount!; i++) {
                    approvedOptions.prev = partsToUpdate[i]._id
                    PartRecord.create(approvedOptions, callbackHandler.updateRecord)
                }
                // Update unapproved records
                for (let i = p.approvedCount!; i < p.quantity!; i++) {
                    deniedOptions.prev = partsToUpdate[i]._id
                    PartRecord.create(deniedOptions, callbackHandler.updateRecord)
                }
            }))
            await pushPayloadToRole('process_checkins', { type:"checkinProcessed", date, by })
            res.status(200).send("Success.");
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    searchParts: async (req: Request, res: Response) => {
        try {
            // Get search string and page info
            let { pageSize, pageSkip, searchString, sort } = getTextSearchParams(req)
            // If search string is empty
            if(searchString == "") {
                // Count all parts
                let numParts = await Part.count()
                // Calc number of pages
                let numPages = getNumPages(pageSize, numParts)
                // Get all parts
                Part.find({})
                    // Sort by NXID
                    .sort(sort)
                    // Skip - gets requested page number
                    .skip(pageSkip)
                    // Limit - returns only enough elements to fill page
                    .limit(pageSize)
                    // Return search to user
                    .exec(returnPartSearch(numPages, numParts, req, res))
                return
            }
            // Get regex for aggregate search
            let { regexKeywords, relevanceScore } = getPartSearchRegex(searchString)
            // Use keywords to build search options
            let aggregateQuery = [
                {
                    $match: {
                        $or: regexKeywords
                    }
                },
                {
                    $addFields: {
                        relevance: {
                            $sum: relevanceScore
                        }
                    }
                },
                {
                    $sort: sort
                },
                {
                    $project: { relevance: 0 }
                }
            ] as any
            // Aggregate count
            let countQuery = await Part.aggregate(aggregateQuery).count("numParts")
            // This is stupid but it works
            let numParts = countQuery.length > 0&&countQuery[0].numParts ? countQuery[0].numParts : 0
            // Ternary that hurts my eyes
            let numPages = getNumPages(pageSize, numParts)
            // Search
            Part.aggregate(aggregateQuery)
                .skip(pageSkip)
                .limit(pageSize)
                .exec(returnPartSearch(numPages, numParts, req, res))
            //}
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    // Update
    updatePartInfo: async (req: Request, res: Response) => {
        try {
            // Find part
            let part = req.body.part
            // Try to add part to database
            let newPart = cleansePart(part)
            // Send part to database
            newPart.created_by = req.user.user_id;
            // Updated part is the old part from database
            if (!isValidPartID(newPart.nxid))
                return res.status(400).send("Invalid part ID");
            // Update part
            let updatedPart = await Part.findByIdAndUpdate(part._id, newPart);
            // If part isn't found
            if (updatedPart == null) {
                return res.status(400).send("Part not found.");
            }
            // If part is now consumable
            if (newPart.consumable&&!updatedPart.consumable) {
                // Get kiosk names
                let kiosks = await getAllKioskNames()
                // Mark all parts outside kiosks as consumed
                await PartRecord.updateMany({ nxid: updatedPart.nxid, next: null, location : {$nin: kiosks} }, {$set: {next: 'consumed'}})
            }
            // If NXID was changed
            if (newPart.nxid != updatedPart.nxid) {
                // Update old NXID to new NXID
                await PartRecord.updateMany({ nxid: updatedPart.nxid }, {$set: {nxid: newPart.nxid}})
            }
            // Return success
            return res.status(201).json(updatedPart);
        } catch (err) {
            // Database error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    addToInventory: async (req: Request, res: Response) => {
        try {
            // Get info from request
            let { part, owner } = req.body
            const { nxid, quantity, location, building } = part;
            // let serials = [] as string[]
            let kioskNames = await getKioskNamesAsync(req.user.building)
            // If any part info is missing, return invalid request
            if (!(nxid && location && building)||!(quantity > 0))
                return res.status(400).send("Invalid request");
            let partInfo = await Part.findOne({nxid: nxid}) as PartSchema
            if(partInfo==null)
                return res.status(400).send("Part not found");
            if(partInfo.consumable&&!kioskNames.includes)
                return res.status(400).send("Unable to add consumables outside parts room");
            let createOptions = {
                nxid,
                location: location,
                building: building,
                prev: null,
                next: null,
                by: req.user.user_id,
                date_created: new Date()
            } as PartRecordSchema

            switch(location) {
                case "Asset":
                    // Make sure asset exists
                    let asset = await Asset.findOne({ asset_tag: owner._id }) as AssetSchema
                    if(asset == null) 
                        return res.status(400).send("Asset Not Found");
                    // Add info to create options
                    createOptions.building = asset.building
                    createOptions.asset_tag = asset.asset_tag
                    break
                case "Tech Inventory":
                    // Check if id exists
                    if (owner) {
                        // Make sure tech exists
                        let tech = await User.findById(owner._id)
                        if (tech == null)
                            return res.status(400).send("User Not Found");
                        // Add create options 
                        createOptions.owner = tech._id
                        createOptions.building = tech.building
                    } 
                    else 
                        return res.status(400).send("Owner not present in request");
                    break
                case "All Techs":
                    createOptions.owner = 'all'
                    break
                case "Testing":
                    createOptions.owner = 'testing'
                default:
                    break
            }
            // Find part info
            Part.findOne(async (err: MongooseError, part: PartSchema) => {
                if (err)
                    return res.status(500).send("API could not handle your request: " + err);
                if(!part)
                    return res.status(400).send("Part not found.");
                for (let i = 0; i < quantity; i++) {
                    // Create new parts records to match the quantity
                    PartRecord.create(createOptions, callbackHandler.callbackHandleError);
                }
                // Success
                res.status(200).send("Successfully added to inventory")
            }, { nxid });
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    deletePart: async (req: Request, res: Response) => {
        try {
            // Try to find and delete by ID
            if(req.query.nxid == undefined)
                return res.status(400).send("NXID missing from request");
            let nxid = (req.query.nxid as string).toUpperCase();
            // 
            let part = await Part.findOne({nxid})
            if(part==null||part==undefined)
                return res.status(400).send("Part not found");
            // Delete info
            Part.findByIdAndDelete(part?._id, async (err: MongooseError, _: PartSchema) =>{
                if (err) {
                    // Error - don't return so other records will be deleted
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Find all parts records associated with asset tag
                let records = await PartRecord.find({ nxid, next: null,})   
                let current_date = Date.now()
                let cartItems = partRecordsToCartItems(records)
                let newInfo = {
                    next: 'deleted',
                    building: req.user.building,
                    location: "Parts Room",
                    date_created: current_date,
                    by: req.user.user_id
                }
                // Find all records associated with asset
                await updatePartsAsync(newInfo, { nxid, next: null,}, cartItems, false)
                // Delete the part image
                const targetPath = path.join(UPLOAD_DIRECTORY, 'images/parts', `${nxid}.webp`)
                if(fs.existsSync(targetPath))
                    fs.unlinkSync(targetPath)
                res.status(200).send("Successfully deleted part and records");
            });
            // Success
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getDistinctOnPartRecords: async (req: Request, res: Response) => {
        try {
            // Get key to find distinct values
            const { key, where } = req.query;
            let temp = where as PartRecordSchema
            // Check for null
            if(temp&&temp.next!&&temp.next=="null")
                temp.next = null
            // Check for null
            if(temp&&temp.prev!&&temp.prev=="null")
                temp.prev = null
            // Find all distinct part records
            PartRecord.find(temp).distinct(key as string, (err: MongooseError, record: PartRecordSchema[]) => {
                if (err)
                    res.status(500).send("API could not handle your request: " + err);
                else
                    res.status(200).json(record);
            })
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getDistinctOnPartInfo: async (req: Request, res: Response) => {
        try {
            // Get key to find distinct values
            const { key } = req.query;
            // Find all distinct part records
            Part.find().distinct(key as string, (err: MongooseError, record: PartSchema[]) => {
                if (err)
                    res.status(500).send("API could not handle your request: " + err);
                else
                    res.status(200).json(record);
            })
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getUserInventory: async (req: Request, res: Response) => {
        try {
            const { user_id } = req.query.user_id ? req.query : req.user
            // Fetch part records
            PartRecord.find({ next: null, owner: user_id ? user_id : req.user.user_id }, async (err: MongooseError, records: PartRecordSchema[]) => {
                if (err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let returnValue = partRecordsToCartItems(records)
                // Send response
                res.status(200).json(returnValue)
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPartRecordsByID: async (req: Request, res: Response) => {
        try {
            // Get nxid from query
            const { nxid } = req.query
            // Find all current parts records associated with nxid
            PartRecord.find({
                nxid,
                next: null
            }, (err: MongooseError, record: PartRecordSchema[]) => {
                if (err)
                    res.status(500).send("API could not handle your request: " + err);
                else
                    res.status(200).json(record);
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPartRecords: async (req: Request, res: Response) => {
        try {
            // Get nxid from query
            let params = req.query as PartRecordSchema;
            params.next = null
            // Find all current parts records associated with nxid
            PartRecord.find(params, (err: MongooseError, record: PartRecordSchema[]) => {
                if (err)
                    res.status(500).send("API could not handle your request: " + err);
                else
                    res.status(200).json(record);
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPartHistoryByID: async (req: Request, res: Response) => {
        try {
            // Get mongo ID from query
            const { id } = req.query
            // Find first part record
            let record = await PartRecord.findById(id) as PartRecordSchema
            if(record.serial) {
                PartRecord.aggregate([
                    {
                        $match: {
                            nxid: record.nxid,
                            serial: record.serial
                        }
                    },
                    {
                        $sort: {
                            date_created: -1
                        }
                    }
                ], async (err: CallbackError, result: PartRecordSchema[]) =>{
                    if(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    if(result.length==0)
                        res.status(200).json([])
                    let next = ""
                    let next_prev = ""
                    let next_date = new Date()
                    let returnArray = []
                    // Loop through everything and check for history gaps
                    for(let p of result) {
                        if(p.next!=null&&p.next!=next) {
                            // If first record in array
                            if(next==""&&next_prev==""&&isValidObjectId(p.next)) {
                                let first_record = await PartRecord.findById(p.next)
                                if(first_record)
                                    returnArray.push(first_record)
                            }
                            // All other records
                            else{
                                // Get the first record before serial was added
                                let after_gap = await PartRecord.findById(next_prev)
                                if(after_gap)
                                    returnArray.push(after_gap)
                                // Push gap disclaimer
                                returnArray.push({
                                    _id: "NO_ID",
                                    nxid: p.nxid,
                                    serial: p.serial,
                                    location: "HISTORY GAP",
                                    date_created: p.date_replaced,
                                    date_replaced: next_date
                                })
                                // Push the first record after serial was removed
                                let before_gap = await PartRecord.findById(p.next)
                                if(before_gap)
                                    returnArray.push(before_gap)
                            }
                        }
                        returnArray.push(p)
                        next = p._id
                        next_prev = p.prev as string
                        next_date = p.date_created! as Date
                    }
                    // Get the very last record in array
                    let last_record = returnArray[returnArray.length - 1]
                    // Get the previous
                    if(last_record&&last_record.prev!=null) {
                        let very_last_record = await PartRecord.findById(last_record.prev)
                        if(very_last_record)
                            returnArray.push(very_last_record)
                    }
                    // done
                    res.status(200).json(returnArray)
                })
            }
            else {
                let kiosks = await getAllKioskNames()
                if(record == null) {
                    return res.status(400).send("Record not found");
                }
                // Create array of part history
                let history = [record]
                // Loop until previous record is false
                while (record.prev != null&&!(record.location&&kiosks.includes(record.location))) {
                    record = await PartRecord.findById(record!.prev) as PartRecordSchema
                    history.push(record)
                }
                // Send history to client
                res.status(200).json(history)
            }
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    movePartRecords: async (req: Request, res: Response) => {
        try {
            // Get data from request
            let { old_owner, new_owner } = req.body
            let parts = req.body.parts as CartItem[]
            parts = sanitizeCartItems(parts)
            if(new_owner=="sold")
                return res.status(400).send("Please refresh to update app");
            // Check if cart items are valid
            if(!(await cartItemsValidAsync(parts)))
                return res.status(400).send("Error in updated parts list");
            // Check if user has cart items in inventory
            if(!(await userHasInInventoryAsync(old_owner, parts)))
                return res.status(400).send("User does not have parts in inventory");
            // Check if location is valid
            let to = {} as PartRecordSchema
            to.owner = new_owner ? new_owner as string : "";
            to.next = null
            let user = await User.findById(req.user.user_id)
            if(!user)
                return res.status(400).send("User not found");
            let buildingSwitchPerms = user.roles?.includes("building_transfer")
            let deletePartPerms = user.roles?.includes("delete_parts")
            switch (new_owner) {
                case 'all':
                    // All techs
                    to.location = 'All Techs'
                    break;
                // LA parts transfer
                case 'la':
                    if(!buildingSwitchPerms)
                        return res.status(400).send("Invalid permissions");
                    to.location = 'LA Transfers'
                    to.building = 1
                    break;
                // Ogden parts transfer
                case 'og':
                    if(!buildingSwitchPerms)
                        return res.status(400).send("Invalid permissions");
                    to.location = 'Ogden Transfers'
                    to.building = 3
                    break
                case 'ny':
                    if(!buildingSwitchPerms)
                        return res.status(400).send("Invalid permissions");
                    to.location = 'NY Transfers'
                    to.building = 4
                    break
                case 'testing':
                    // Testing center
                    to.location = 'Testing Center'
                    break;
                case 'hdd':
                    // Testing center
                    to.location = 'Drive Wipe Shelf'
                    break;
                case 'lost':
                    if(!deletePartPerms)
                        return res.status(400).send("You do not have permissions to mark parts as lost");
                    to.next = 'lost'
                    to.location = 'lost'
                    break;
                case 'broken':
                    if(!deletePartPerms)
                        return res.status(400).send("You do not have permissions to mark parts as broken");
                    to.next = 'broken'
                    to.location = 'broken'
                    break;
                case 'deleted':
                    if(!deletePartPerms)
                        return res.status(400).send("You do not have permissions to mark parts as deleted");
                    to.next = 'deleted'
                    to.location = 'deleted'
                    break;
                // Add more cases here if necessary...
                default:
                    if (!mongoose.Types.ObjectId.isValid(to.owner))
                        return res.status(400).send("Invalid id")
                    // Check if user exists
                    let findUser = await User.findOne({ _id: to.owner })
                    // Return if user not found
                    if (findUser==null)
                        return res.status(400).send("User not found")
                    
                    to.location = 'Tech Inventory'
                    to.building = findUser.building
            }
            to.date_created = Date.now()
            to.building = to.building ? to.building : req.user.building
            to.by = req.user.user_id
            // Update records
            let searchOptions = {owner: old_owner, next: null}
            await updatePartsAsync(to, searchOptions, parts, false)
            return res.status(200).send("Success");
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    sellOnEbay: async (req: Request, res: Response) => {
        try {
            // Get data from request
            let parts = req.body.parts as InventoryEntry[]
            parts = sanitizeInventoryEntries(parts)
            // Check if cart items are valid
            if(!(await inventoryEntriesValidAsync(parts)))
                return res.status(400).send("Error in updated parts list");
            // Check if user has cart items in inventory
            let partsToCheck = [] as CartItem[]
            // Convert InventoryEntries to CartItems
            parts.map((p)=>{
                // Map serials
                p.serials.map((s)=>{
                    partsToCheck.push({nxid: p.nxid!, serial: s})
                })
                // Push unserialized
                if(p.unserialized>0)
                    partsToCheck.push({nxid: p.nxid!, quantity: p.unserialized})
            })
            // Check if user has inventory 
            if(!(await userHasInInventoryAsync(req.user.user_id, partsToCheck)))
                return res.status(400).send("User does not have parts in inventory");
            // Check if location is valid
            let to = {} as PartRecordSchema
            to.owner = "sold";
            to.ebay = stringSanitize(req.body.orderID, false)
            to.next = 'sold'
            to.location = 'sold'
            to.date_created = Date.now()
            to.building = req.user.building
            to.by = req.user.user_id
            // Update records
            let searchOptions = {owner: req.user.user_id, next: null}
            await updatePartsAddSerialsAsync(to, searchOptions, parts)
            // Success !!!
            return res.status(200).send("Success");
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    deleteFromPartsRoom: async (req: Request, res: Response) => {
        try{
            // Get request params
            let nxid = req.query.nxid as string
            // Parse integers
            let new_quantity = parseInt(req.query.new_quantity as string)
            let building = req.query.building?parseInt(req.query.building as string):req.user.building
            let location = req.query.location as string
            let kiosks = await getKioskNamesAsync(building)
            // Check request
            if(!nxid||!isValidPartID(nxid)||new_quantity<0||!kiosks.includes(location))
                return res.status(400).send("Invalid request");
            let partInfo = await Part.findOne({nxid})
            if(partInfo?.serialized)
                return res.status(400).send("Cannot delete serialized records");
            // Find parts room records
            PartRecord.find({nxid: nxid, building: building, location: location, next: null}, async (err: MongooseError, oldRecords: PartRecordSchema[])=>{
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                // Check if current quantity is less than new quantity
                if(new_quantity>oldRecords.length)
                    return res.status(400).send("New quantity is greater than current quantity");
                // Get date for updates
                let current_date = Date.now()
                // Filter records to quantity and update
                await Promise.all(oldRecords.filter((_,i)=>new_quantity>i).map(async(rec)=>{
                    // Create new record
                    let new_record = JSON.parse(JSON.stringify(rec))
                    new_record.prev = new_record._id
                    new_record.date_created = current_date
                    new_record.next = 'deleted'
                    new_record.location = 'deleted'
                    new_record.by = req.user.user_id
                    new_record.building = building
                    delete new_record._id
                    PartRecord.create(new_record, callbackHandler.updateRecord)
                }))
                // Done
                return res.status(200).send("Success");
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPartImage: async (req: Request, res: Response) => {
        try {
            // Create path to image
            let imagePath = path.join(UPLOAD_DIRECTORY, 'images/parts', `${req.params.nxid}.webp`)
            // Check if it exists and edit path if it doesn't
            if(!fs.existsSync(imagePath))
                imagePath = path.join(UPLOAD_DIRECTORY, 'images', 'notfound.webp')
            // Send image
            res.sendFile(imagePath)
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    auditPart: async (req: Request, res: Response) => {
        try {
            // Create path to image
            let nxid = req.query.nxid as string
            // Check if NXID valid
            if(!nxid||!/PNX([0-9]{7})+/.test(nxid))
                return res.status(400).send("NXID invalid");
            let date = Date.now()
            // Find and update part
            Part.findOneAndUpdate({nxid}, { audited: date }, (err: MongooseError, part: PartSchema) => {
                if(err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Success
                return res.status(200).send(part);
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    nextSequentialNXID: async (_: Request, res: Response) => {
        // Basic binary search
        function findMissingNumber(arr: number[]) {
            // Initialize boundaries
            let left = 0;
            let right = arr.length - 1;
            // Left will be equal to right when number is found
            while (left < right) {
                // Find the middle
                const mid = Math.floor(left + (right - left) / 2);
                // Check if number is in left side
                if (arr[mid] - arr[0] - mid !== 0) {
                    // Move right boundary to middle
                    right = mid - 1;
                } else {
                    // Number is in right side, move left to middle
                    left = mid + 1;
                }
            }
            // Check whether missing number is on right or left
            if (arr[left] === arr[left - 1] + 1) {
                return arr[left] + 1;
            } else {
                return arr[left-1] + 1;
            }
        }
        try {
            Part.find({}, (err: MongooseError, parts: PartSchema[]) => {
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                // Parse and sort numbers
                let numbers = parts.map((n)=>parseInt(n.nxid!.slice(3))).sort((a,b)=>a-b)
                // Set next sequential to last NXID + 1
                let nextSequential = numbers[numbers.length-1] + 1
                // Check if there are numbers missing from the array
                if((numbers[numbers.length-1]-numbers[0])>numbers.length) {
                    // Find missing number
                    nextSequential = findMissingNumber(numbers) 
                }
                // Pad and convert to string
                let nxid = "PNX"+nextSequential.toString().padStart(7, '0')
                // Send response
                return res.status(200).send(nxid);
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    mergeParts: async (_: Request, res: Response) => {
        try {

        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
};

export default partManager;

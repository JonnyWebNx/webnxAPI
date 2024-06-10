import Part from '../model/part.js'
import PartRecord from '../model/partRecord.js'
import Asset from '../model/asset.js'
import User from "../model/user.js";
import handleError from "../util/handleError.js";
import callbackHandler from '../util/callbackHandlers.js'
import { AssetSchema, CartItem, CheckInQueuePart, InventoryEntry, NotificationTypes, PartRecordSchema, UserSchema, PartSchema, BoxSchema, PartQuery } from "../interfaces.js";
import mongoose, { CallbackError, isValidObjectId, MongooseError } from "mongoose";
import { Request, Response } from "express";
import path from 'path';
import config from '../config.js'
import fs from 'fs';
import {
    cartItemsValidAsync,
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
    checkPartThreshold,
    getPartCounts,
} from '../methods/partMethods.js';
import { updatePartsAsync, updatePartsAddSerialsAsync, userHasInInventoryAsync, partRecordsToCartItems, updatePartsAddSerialsDryRunAsync, isValidAssetTag, getAddedAndRemovedWithNewSerials } from '../methods/assetMethods.js';
import { getNumPages, getPageNumAndSize, getSearchSort, getStartAndEndDate, getTextSearchParams, objectToRegex } from '../methods/genericMethods.js';
import { stringSanitize } from '../util/sanitize.js';
import PartRequest from '../model/partRequest.js';
import { pushPayloadToRole, sendNotificationToGroup, sendNotificationToUser } from '../methods/notificationMethods.js';
import { isValidBoxTag } from '../methods/boxMethods.js';
import Box from '../model/box.js';
import AuditRecord from '../model/auditRecord.js';
const { UPLOAD_DIRECTORY } = config

const partManager = {
    countParts: async(req: Request, res: Response) =>{
        try {
            PartRecord.find({next:null}).count().exec().then((count)=>{
                res.status(200).json(count);
            })
            .catch((err)=>{
                return res.status(500).send("API could not handle your request: " + err);
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
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
    // Read
    getPart: async (req: Request, res: Response) => {
        try {
            // Destructure request
            let { pageSize, pageSkip } = getPageNumAndSize(req)
            let sort = getSearchSort(req)
            let skipPagination = req.query.skipPagination == "true" ? true : false
            if(sort['location']!=undefined) 
                sort = {rack_num: sort['location'], shelf_location: sort['location']}
            delete req.query.pageNum
            delete req.query.pageSize
            delete req.query.location
            delete req.query.building
            delete req.query.advanced;
            delete req.query.sortString
            delete req.query.sortDir;
            delete req.query.skipPagination
            // Typecast part
            let req_part = req.query

            let regexObject = {} as PartQuery
            Object.keys(req_part).forEach((k)=>{
                // early return for empty strings
                if(req_part[k]=='')
                    return
                // ALlow array partial matches
                if(Array.isArray(req_part[k])&&!(req_part[k]!.length==0)) {
                    // Use $all with array of case insensitive regexes
                    return regexObject[k] = { $all: req_part[k] }
                }
                regexObject[k] = req_part[k]
            })
            // Create query part
            let numParts = await Part.count(regexObject)
            // If no regex has results
            if(numParts>0) {
                // Calc num pages
                let numPages = getNumPages(pageSize, numParts)
                if(skipPagination) {
                    Part.find(regexObject)
                        .sort(sort)
                        .exec()
                        .then(async (parts)=>{
                            let loadedParts = await getPartCounts(req, parts)
                            return res.status(200).json(loadedParts);
                        })
                        .catch((err)=>{
                            return res.status(500).send("API could not handle your request: " + err);
                        })
                }
                else {
                    // Search without regex
                    Part.find(regexObject)
                        .sort(sort)
                        .skip(pageSkip)
                        .limit(pageSize)
                        .exec(returnPartSearch(numPages, numParts, req, res))
                }
            }
            // No regex has no results
            else {
                // Create regex
                let search_part = objectToRegex(req_part)
                // Get num parts
                numParts = await Part.count(search_part)
                // Get num pages
                let numPages = getNumPages(pageSize, numParts)
                // Regex search
                if(skipPagination) {
                    Part.find(search_part)
                        .sort(sort)
                        .exec()
                        .then(async (parts)=>{
                            let loadedParts = await getPartCounts(req, parts)
                            return res.status(200).json(loadedParts);
                        })
                        .catch((err)=>{
                            return res.status(500).send("API could not handle your request: " + err);
                        })
                }
                else {
                    Part.find(search_part)
                        .sort(sort)
                        .skip(pageSkip)
                        .limit(pageSize)
                        .exec(returnPartSearch(numPages, numParts, req, res))
                }
            }
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
            let box_tag = ""
            let is_box = false
            if(req.query.location&&isValidBoxTag(req.query.location as string)) {
                is_box = true
                box_tag = req.query.location as string
                req.query.location = "Box"
            }
            kiosks.push("Box")
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
            let search = {
                nxid: part.nxid,
                building: req.query.building ? req.query.building : req.user.building,
                location: req.query.location ? req.query.location : {$in: kiosks},
                next: null
            } as any
            if(is_box)
                search.box_tag = box_tag
            let quantity = await PartRecord.count(search);
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

    getKioskQuantities: async (req: Request, res: Response) => {
        try {
            // Parse the cart items from the request
            let nxids = Array.isArray(req.query.part) ? req.query.part as [] : [req.query.part]
            // Check if the cart items are valid
            let kiosks = await getAllKioskNames()
            kiosks.push("Box")
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
                        _id: { nxid: "$nxid", location: "$location", box_tag: "$box_tag" },
                        quantity: { $sum: 1 },
                        serials: {
                            $push: "$serial"
                        },
                    }
                },
                {
                    $group: {
                        _id: "$_id.nxid",
                        kiosk_quantities: {
                            $push: {
                                kiosk: "$_id.location",
                                box_tag: "$_id.box_tag",
                                quantity: "$quantity",
                                serials: "$serials",
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
            // Try to find the user
            let user = await User.findById(user_id).exec()
            // Check if user is invalid
            if(user_id==null||user_id==undefined||user==null)
                // Return error
                return res.status(400).send("Invalid request")
            let current_date = Date.now();
            // Find each item and check quantities before updating
            let kiosk = await User.findById(req.user.user_id)
            let kioskName = kiosk?.first_name + " " + kiosk?.last_name
            // Type cast cart
            cart = cart as InventoryEntry[]
            let cartCopy = JSON.parse(JSON.stringify(cart)) as InventoryEntry[]
            // Get parts from kiosk
            let searchOptions = {
                next: null,
                location: kioskName,
                building: req.user.building
            }
            // Try update dry run
            let { skipped } = await updatePartsAddSerialsDryRunAsync(searchOptions, cart)
            // If parts were skipped
            if(skipped.length>0) {
                let failString = "Failed to check out because of missing parts: "
                for(let s of skipped) {
                    failString += `\n${s.nxid}: ${s.quantity}`
                }
                // Return error
                return res.status(400).send(failString)
            }
            // Generate the create options
            let createOptions = {
                owner: user_id,
                location: "Tech Inventory",
                building: req.user.building,
                by: req.user.user_id,
                next: null,
                date_created: current_date,
            }
            // Update part records
            await updatePartsAddSerialsAsync(createOptions, searchOptions, cart)
            // Success
            res.status(200).send("Successfully checked out.")
            cartCopy.map((ie)=>ie.nxid!).filter((v,i,arr)=>arr.indexOf(v)==i).map((nxid)=>{
                checkPartThreshold(nxid, req.user.building)
            })
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
                // This is a mess.
                if((parts[i].approved||(parts[i].approvedCount&&parts[i].approvedCount!>0))&&(!parts[i].newLocation||!(kiosks.has(parts[i].newLocation!)||isValidBoxTag(parts[i].newLocation!))))
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
            let boxes = new Map<string, string>()
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
                    serial: p.serial,
                    building: req.user.building,
                    by: req.user.user_id,
                    date_created: current_date,
                } as PartRecordSchema
                // If new location is a box
                if(p.newLocation&&isValidBoxTag(p.newLocation)) {
                    // Change the approved options
                    approvedOptions = {
                        nxid: p.nxid,
                        next: null,
                        location: "Box",
                        box_tag: p.newLocation,
                        // Include the serial on boxes
                        serial: p.serial,
                        building: req.user.building,
                        by: req.user.user_id,
                        date_created: current_date,
                    } as PartRecordSchema
                    // These 2 lines should hopefully prevent duplicates.
                    if(!boxes.has(p.newLocation)) {
                        boxes.set(p.newLocation, "")
                        // Check if the box exists
                        let existingBox = await Box.findOne({box_tag: p.newLocation})
                        // If box does not exist
                        if(existingBox==null) {
                            // Create it
                            await Box.create({
                                box_tag: p.newLocation!,
                                location: "Check In",
                                building: req.user.building,
                                notes: "Box was generated automatically through a check in request.",
                                by: req.user.user_id,
                                date_created: current_date,
                                next: null,
                                prev: null,
                            })
                        }
                    }
                }
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
                    if(partToUpdate!.buy_price) {
                        approvedOptions.buy_price = partToUpdate!.buy_price
                        deniedOptions.buy_price = partToUpdate!.buy_price
                    }
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
                    if(partsToUpdate[i].buy_price)
                        approvedOptions.buy_price = partsToUpdate[i].buy_price
                    PartRecord.create(approvedOptions, callbackHandler.updateRecord)
                }
                // Update unapproved records
                for (let i = p.approvedCount!; i < p.quantity!; i++) {
                    deniedOptions.prev = partsToUpdate[i]._id
                    if(partsToUpdate[i].buy_price)
                        approvedOptions.buy_price = partsToUpdate[i].buy_price
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
            
            let skipPagination = req.query.skipPagination == "true" ? true : false

            if(sort['location']!=undefined) 
                sort = {rack_num: sort['location'], shelf_location: sort['location']}
            if(searchString == ""&&sort['quantity']!=undefined) {
                // Count all parts
                let numParts = await Part.count()
                // Calc number of pages
                let numPages = getNumPages(pageSize, numParts)
                // Get all parts
                Part.find({})
                    // Return search to user
                    .exec()
                    .then(async (parts)=>{
                        let loadedParts = await getPartCounts(req, parts)
                        loadedParts = loadedParts.sort((a, b)=>{
                            if(a.quantity<b.quantity) {
                                return -1 * sort['quantity']
                            }
                            else if(a.quantity>b.quantity) {
                                return 1 * sort['quantity']
                            }
                            if(a.total_quantity<b.total_quantity) {
                                return -1 * sort['quantity']
                            }
                            else if(a.total_quantity>b.total_quantity) {
                                return 1 * sort['quantity']
                            }
                            return 0
                        })
                        if(skipPagination) {
                            return res.status(200).json(loadedParts);
                        }
                        else {
                            loadedParts = loadedParts
                            .splice(pageSkip, pageSize)
                            return res.status(200).json({ pages: numPages, total: numParts, items: loadedParts});
                        }
                    })
                    .catch((err)=>{
                        return res.status(500).send("API could not handle your request: " + err);
                    })
                return
            }
            // If search string is empty
            else if(searchString == "") {
                // Count all parts
                let numParts = await Part.count()
                // Calc number of pages
                let numPages = getNumPages(pageSize, numParts)
                if(JSON.stringify(sort)==JSON.stringify({ relevance: -1 })) 
                    sort = {nxid:1}
                if(skipPagination) {
                    // Get all parts
                    Part.find({})
                        // Sort by NXID
                        .sort(sort)
                        // Return search to user
                        .exec()
                        .then(async (parts)=>{
                            let loadedParts = await getPartCounts(req, parts)
                            return res.status(200).json(loadedParts);
                        })
                        .catch((err)=>{
                            return res.status(500).send("API could not handle your request: " + err);
                        })
                }
                else {

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
                }
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
                // {
                //     $project: { relevance: 0 }
                // }
            ] as any
            // Aggregate count
            let countQuery = await Part.aggregate(aggregateQuery).count("numParts")
            // This is stupid but it works
            let numParts = countQuery.length > 0&&countQuery[0].numParts ? countQuery[0].numParts : 0
            // Ternary that hurts my eyes
            let numPages = getNumPages(pageSize, numParts)
            if(sort['quantity']!=undefined) {
                Part.aggregate(aggregateQuery)
                    // Return search to user
                    .exec()
                    .then(async (parts)=>{
                        let loadedParts = await getPartCounts(req, parts)
                        loadedParts = loadedParts.sort((a, b)=>{
                            if(a.quantity<b.quantity) {
                                return -1 * sort['quantity']
                            }
                            else if(a.quantity>b.quantity) {
                                return 1 * sort['quantity']
                            }
                            if(a.total_quantity<b.total_quantity) {
                                return -1 * sort['quantity']
                            }
                            else if(a.total_quantity>b.total_quantity) {
                                return 1 * sort['quantity']
                            }
                            return 0
                        })
                        if(skipPagination) {
                            return res.status(200).json(loadedParts);
                        }
                        else {
                            loadedParts = loadedParts
                            .splice(pageSkip, pageSize)
                            return res.status(200).json({ pages: numPages, total: numParts, items: loadedParts});
                        }
                    })
                    .catch((err)=>{
                        return res.status(500).send("API could not handle your request: " + err);
                    })
                return
            }
            aggregateQuery.push(
                {
                    $sort: sort
                })

            if(skipPagination) {
                // Get all parts
                Part.aggregate(aggregateQuery)
                    // Return search to user
                    .exec()
                    .then(async (parts)=>{
                        let loadedParts = await getPartCounts(req, parts)
                        return res.status(200).json(loadedParts);
                    })
                    .catch((err)=>{
                        return res.status(500).send("API could not handle your request: " + err);
                    })
            }
            else {
                // Search
                Part.aggregate(aggregateQuery)
                    .skip(pageSkip)
                    .limit(pageSize)
                    .exec(returnPartSearch(numPages, numParts, req, res))
            }
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
            let date = new Date()
            let createOptions = {
                nxid,
                location: location,
                building: building,
                prev: null,
                next: null,
                by: req.user.user_id,
                date_created: date
            } as PartRecordSchema

            switch(location) {
                case "Asset":
                    if(!isValidAssetTag(owner._id))
                        return res.status(400).send("Invalid asset tag.");
                    // Make sure asset exists
                    let asset = await Asset.findOne({ asset_tag: owner._id }) as AssetSchema
                    if(asset == null) 
                        return res.status(400).send("Asset Not Found");
                    // Add info to create options
                    createOptions.building = asset.building
                    createOptions.asset_tag = asset.asset_tag
                    break
                case "Box":
                    if(!isValidBoxTag(owner._id))
                        return res.status(400).send("Invalid box tag.");
                    // Make sure asset exists
                    let box = await Box.findOne({ box_tag: owner._id }) as BoxSchema
                    if(box == null) {
                        box = {
                            box_tag: owner._id,
                            by: req.user.user_id,
                            building: req.user.building,
                            date_created: date,
                            next: null,
                            prev: null,
                            notes: "Automatically created from inventory adjustments",
                            location: "TBD",
                        } as BoxSchema
                        await Box.create(box)
                    }
                    // Add info to create options
                    createOptions.building = box.building
                    createOptions.box_tag = box.box_tag
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

            let perUnitPrice = req.body.perUnitPrice
            let priceMap = new Map<string, number>()
            for (let p of perUnitPrice) {
                if(p.nxid&&p.cost)
                    priceMap.set(p.nxid, p.cost)
            }

            let assets = req.body.assets as AssetSchema[]
            let assetPartListMatches = await Promise.all(assets.map(async (asset)=>{
                return PartRecord.find({next: null, asset_tag: asset.asset_tag}).exec()
                    .then(async (partRecords)=>{
                        let {added, removed} = getAddedAndRemovedWithNewSerials(asset.parts, partRecords)
                        return added.length==0&&removed.length==0
                    })
                    .catch((err)=>{
                        return false
                    })
            }))
            for (let match of assetPartListMatches) {
                if(!match)
                    return res.status(400).send("Error in asset parts list");
            }

            let assetDryRuns = await Promise.all(assets.map(async (asset)=>{
                let searchOptions = {asset_tag: asset.asset_tag, next: null}
                let partMap = new Map<string, InventoryEntry>()
                for(let part of asset.parts) {
                    let ie = { nxid: part.nxid, unserialized: 0, serials: [] } as InventoryEntry
                    if(partMap.has(part.nxid))
                        ie = partMap.get(part.nxid)!
                    if(part.serial&&part.serial!="")
                        ie.serials.push(part.serial!)
                    else
                        ie.unserialized++
                    partMap.set(part.nxid, ie)
                }
                let { skipped } = await updatePartsAddSerialsDryRunAsync(searchOptions, Array.from(partMap.values()))
                return skipped.length == 0
            }))
            for (let update of assetDryRuns) {
                if(!update)
                    return res.status(400).send("Error in asset parts list 2");
            }

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
            // if(!(await userHasInInventoryAsync(req.user.user_id, partsToCheck)))
            //     return res.status(400).send("User does not have parts in inventory");
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
            // Dry run to check for skipped parts
            let { skipped } = await updatePartsAddSerialsDryRunAsync(searchOptions, parts)
            // If parts were skipped
            if(skipped.length>0) {
                let failString = "Failed to update because of errors with the following parts: "
                for(let s of skipped) {
                    failString += `\n${s.nxid}: ${s.quantity}`
                }
                // Return error
                return res.status(400).send(failString)
            }

            await Promise.all(assets.map(async (asset)=>{
                let searchOptions = {asset_tag: asset.asset_tag, next: null}
                let partMap = new Map<string, InventoryEntry>()
                for(let part of asset.parts) {
                    let ie = { nxid: part.nxid, unserialized: 0, serials: [] } as InventoryEntry
                    if(partMap.has(part.nxid))
                        ie = partMap.get(part.nxid)!
                    if(part.serial&&part.serial!="")
                        ie.serials.push(part.serial!)
                    else
                        ie.unserialized++
                    partMap.set(part.nxid, ie)
                } 
                let newTo = JSON.parse(JSON.stringify(to))
                newTo.asset_tag = asset.asset_tag
                await updatePartsAddSerialsAsync(newTo, searchOptions, Array.from(partMap.values()), priceMap)
                await Asset.findOne({asset_tag: asset.asset_tag, next: null}).exec()
                    .then(async (ass1)=>{
                        let ass = JSON.parse(JSON.stringify(ass1))
                        if(ass) {
                            ass.prev = ass._id
                            delete ass._id
                            delete ass.pallet
                            ass.next = 'sold'
                            ass.ebay = stringSanitize(req.body.orderID, false)
                            ass.location = 'sold'
                            ass.date_created = to.date_created
                            ass.building = req.user.building
                            ass.by = req.user.user_id
                            Asset.create(ass, callbackHandler.updateAsset)
                        }
                        return
                    })
                    .catch((err)=>{
                        handleError(err)
                    })
            }))
            await updatePartsAddSerialsAsync(to, searchOptions, parts, priceMap)
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
                await Promise.all(oldRecords.filter((r)=>!r.serial).filter((_,i)=>new_quantity>i).map(async(rec)=>{
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
                res.status(200).send("Success");
                checkPartThreshold(nxid, building)
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
            let nxid = req.query.nxid as string
            let notes = req.body.notes as string
            // Check if NXID valid
            if(!nxid||!/PNX([0-9]{7})+/.test(nxid))
                return res.status(400).send("NXID invalid");
            let date = Date.now()
            // Count the part here
            let total = await PartRecord.count({nxid, next: null, building: req.user.building})
            // get the kiosk here
            let kiosks = await getAllKioskNames()
            PartRecord.aggregate([
                {
                    $match: {
                        nxid,
                        location: {$in: kiosks},
                        building: req.user.building,
                        next: null
                    }
                },
                {
                    $group: { 
                        _id: { location: "$location" },
                        quantity: { $sum: 1 },
                    }
                },
                {
                    $project: {
                        _id: 0,
                        kiosk: "$_id.location",
                        quantity: "$quantity"
                    }
                }
            ])
            .then((kiosk_quantities)=>{
                return AuditRecord.create({
                    nxid,
                    kiosk_quantities,
                    notes,
                    total_quantity: total,
                    by: req.user.user_id,
                    building: req.user.building,
                    date
                })
            })
            .then(()=>{
                return Part.findOneAndUpdate({nxid}, {audited: date})
            })
            .then((part)=>{
                return Part.findById(part!._id)
            })
            .then((part)=>{
                return res.status(200).send(part);
            })
            .catch((err)=>{
                return res.status(500).send("API could not handle your request: " + err);
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getAudits: async(req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req)
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            let nxids = req.query.nxids ? req.query.nxids as string[] : []
            let users = req.query.users ? req.query.users as string[] : []
            nxids = nxids.filter((v)=>isValidPartID(v))
            users = users.filter((v)=>isValidObjectId(v))
            // Check if NXID valid
            // Get the audit records for the part id
            AuditRecord.aggregate([
                // Match nxid
                {
                    $match: {
                        nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
                        date: { $lte: endDate, $gte: startDate },
                        by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                    }
                },
                // Sort by date descending
                {
                    $sort: {
                        date: -1
                    }
                }
            ])
            // Creates a thenable promise
            .exec()
            // After query is finished
            .then((records)=>{
                // Get total number of records
                let total = records.length
                // Get number of pages
                let pages = getNumPages(pageSize, total)
                if(skipPagination)
                    return res.status(200).json(records)
                // Splice records to current page
                let events = records.splice(pageSkip, pageSize)
                // Return the search
                return res.status(200).json({total, pages, events})
            })
            // If error occurs
            .catch((err)=>{
                return res.status(500).send("API could not handle your request: " + err);
            })
        }
        catch(err) {
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
    mergeParts: async (req: Request, res: Response) => {
        try {
            let { keep, deleted } = req.query
            if(!(isValidPartID(keep as string)&&isValidPartID(deleted as string)))
                return res.status(400).send("Invalid request.");
            // Update all the part records
            PartRecord.updateMany({nxid: deleted}, {nxid: keep}).exec()
            .then(()=>{
                // Delete the part info
                return Part.deleteOne({nxid: deleted}).exec()
            })
            .then(()=>{
                // Do something...
                return PartRequest.find({
                    $or: [
                        {"parts.nxid": deleted},
                        {"fulfilled_list.parts.nxid": deleted},
                        {"boxes.parts.nxid": deleted},
                    ]
                }).exec()
            })
            .then((partRequests)=>{
                // Update all the exisitng part requests
                return Promise.all(partRequests.map((pr)=>{
                    // Update request list
                    pr.parts = pr.parts.map((p)=>{
                        if(p.nxid==deleted)
                            p.nxid = keep as string
                        return p
                    })
                    // Update Fullfilled list
                    pr.fulfilled_list = pr.fulfilled_list.map((kq)=>{
                        kq.parts = kq.parts.map((p: CartItem)=>{
                            if(p.nxid==deleted)
                                p.nxid = keep as string
                            return p
                        })
                    })
                    // Update box list
                    pr.boxes = pr.boxes.map((bq)=>{
                        bq.parts = bq.parts.map((p: CartItem)=>{
                            if(p.nxid==deleted)
                                p.nxid = keep as string
                            return p
                        })
                    })
                    // Update in db
                    return PartRequest.findByIdAndUpdate(pr._id, pr).exec()
                }))
            })
            .then(()=>{
                // Delete the audit records
                return AuditRecord.deleteMany({nxid: deleted}).exec()
            })
            .then(()=>{
                res.status(200).send("Success")
            })
            .catch((err)=>{
                return res.status(500).send("API could not handle your request: " + err);
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
};

export default partManager;

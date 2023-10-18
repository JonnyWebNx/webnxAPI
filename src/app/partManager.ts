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
import handleError from "../config/handleError.js";
import callbackHandler from '../middleware/callbackHandlers.js'
import { AssetSchema, CartItem, CheckInQueuePart, InventoryEntry, PartRecordSchema, UserSchema } from "./interfaces.js";
import mongoose, { CallbackError, MongooseError } from "mongoose";
import { Request, Response } from "express";
import path from 'path';
import { PartSchema } from "./interfaces.js";
import config from '../config.js'
import fs from 'fs';
import {
    cartItemsValidAsync,
    kioskHasInInventoryAsync,
    sanitizeCartItems,
    cleansePart,
    getKiosksAsync,
    getKioskNamesAsync,
    getAllKiosksAsync,
    getAllKioskNames,
    isValidPartID,
    getPartSearchRegex,
    returnPartSearch,
    sanitizeInventoryEntries,
    inventoryEntriesValidAsync,
} from './methods/partMethods.js';
import { partRecordsToCartItemsWithInfoAsync, updatePartsAsync, updatePartsAddSerialsAsync, userHasInInventoryAsync, partRecordsToCartItems } from './methods/assetMethods.js';
import { getNumPages, getPageNumAndSize, getStartAndEndDate, getTextSearchParams, objectToRegex } from './methods/genericMethods.js';
import { stringSanitize } from '../config/sanitize.js';
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
            // sanitize
            cart = sanitizeCartItems(cart)
            // Check if inventory items are valid
            if(!(await cartItemsValidAsync(cart)))
                return res.status(400).send("Error in checkin items")
            // Check if user has items in inventory
            if(!(await kioskHasInInventoryAsync(kioskName, req.user.building, cart)))
                return res.status(400).send("Items not found in user inventory")
            // Send parts to user inventory
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
            await updatePartsAsync(createOptions, searchOptions, cart, false)
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
            await Promise.all(parts.map((p)=>{
                return new Promise(async (res)=>{
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
                        return res("")
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
                    return res("")
                })
            }))
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
            let { pageSize, pageSkip, searchString } = getTextSearchParams(req)
            // If search string is empty
            if(searchString == "") {
                // Count all parts
                let numParts = await Part.count()
                // Calc number of pages
                let numPages = getNumPages(pageSize, numParts)
                // Get all parts
                Part.find({})
                    // Sort by NXID
                    .sort({ nxid: 1 })
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
                    $sort: { relevance: -1 }
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
            let serials = [] as string[]
            let kioskNames = await getKioskNamesAsync(req.user.building)
            if(part.serial) {
                serials = part.serial
                // Splits string at newline
                .split('\n')
                // Filters out blank lines
                .filter((sn: string) => sn != '')
                // Gets rid of duplicates
                .filter((sn: string, i: number, arr: string[]) => i == arr.indexOf(sn))
                .map((sn: string) => sn.replace(/[, ]+/g, " ").trim());
            }
                        // If any part info is missing, return invalid request
            if (!(nxid && location && building)||(quantity < 1&&serials.length<1))
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
                if(part.serialized&&serials.length > 0) {
                    // Get existing records to check serials
                    let records = await PartRecord.find({nxid, next: null}) as PartRecordSchema[];
                    // Use hashmap for easier and faster checks
                    let serialMap = new Map<string, PartRecordSchema>()
                    // Map array to hashmap
                    for(let i = 0; i < records.length; i++) {
                        serialMap.set(records[i].serial!, records[i])
                    }
                    // Set sentinel value
                    let existingSerial = ""
                    // Check all serials 
                    for(let i = 0; i < serials.length; i++) {
                        // If serial exists in hashmap, set sentinel value
                        if (serialMap.has(serials[i]))
                            existingSerial = serials[i]
                    }
                    // If serial already exists, return error
                    if(existingSerial!="")
                        return res.status(400).send(`Serial number ${existingSerial} already in inventory`);
                    // All serials are new, continue
                    for (let i = 0; i < serials.length; i++) {
                        // Add serial
                        createOptions.serial = serials[i]
                        // Create PartRecords
                        PartRecord.create(createOptions, callbackHandler.callbackHandleError);
                    }
                }
                else if(quantity&&quantity>0){
                    for (let i = 0; i < quantity; i++) {
                        // Create new parts records to match the quantity
                        PartRecord.create(createOptions, callbackHandler.callbackHandleError);
                    }
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
            Part.findByIdAndDelete(part?._id, async (err: MongooseError, part: PartSchema) =>{
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
                let returnValue = await partRecordsToCartItemsWithInfoAsync(records)
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
            let buildingSwitchPerms = req.user.roles.includes("clerk")||req.user.roles.includes("lead")||req.user.roles.includes("admin")
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
                    if(!buildingSwitchPerms)
                        return res.status(400).send("You do not have permissions to mark parts as lost");
                    to.next = 'lost'
                    to.location = 'lost'
                    break;
                case 'broken':
                    if(!buildingSwitchPerms)
                        return res.status(400).send("You do not have permissions to mark parts as broken");
                    to.next = 'broken'
                    to.location = 'broken'
                    break;
                case 'deleted':
                    if(!buildingSwitchPerms)
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
                await Promise.all(oldRecords.filter((p,i)=>new_quantity>i).map(async(rec)=>{
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

    nextSequentialNXID: async (req: Request, res: Response) => {
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

        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
};

export default partManager;

/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Part manager object for querying database and creating responses
 * 
 */
import { stringSanitize, objectSanitize } from '../config/sanitize.js';
import Part from '../model/part.js'
import PartRecord from '../model/partRecord.js'
import Asset from '../model/asset.js'
import User from "../model/user.js";
import handleError from "../config/mailer.js";
import callbackHandler from '../middleware/callbackHandlers.js'
import { AssetSchema, CartItem, PartRecordSchema } from "./interfaces.js";
import mongoose, { CallbackError, Mongoose, MongooseError } from "mongoose";
import { Request, Response } from "express";
import path from 'path';
import { PartSchema } from "./interfaces.js";
import config from '../config.js'
import fs from 'fs';

const { UPLOAD_DIRECTORY } = config


function cleansePart(part: PartSchema) {
    let newPart = {} as PartSchema
    newPart.nxid = part.nxid?.toUpperCase()
    newPart.manufacturer = part.manufacturer
    newPart.name = part.name
    newPart.type = part.type
    newPart.shelf_location = part.shelf_location
    newPart.rack_num = part.rack_num
    newPart.serialized = part.serialized        
    switch(part.type) {
        case "Memory":
            newPart.frequency = part.frequency
            newPart.capacity = part.capacity
            newPart.memory_type = part.memory_type
            newPart.memory_gen = part.memory_gen
            if(part.mem_rank)
                newPart.mem_rank = part.mem_rank
            break
        case "CPU":
            if(part.frequency)
                newPart.frequency = part.frequency
            newPart.socket = part.socket
            break
        case "Motherboard":
            newPart.memory_gen = part.memory_gen
            if(part.chipset)
                newPart.chipset = part.chipset
            newPart.socket = part.socket
            break
        case "Peripheral Card":
            newPart.peripheral_type = part.peripheral_type
            newPart.num_ports = part.num_ports
            newPart.port_type = part.port_type
            break
        case "Storage":
            newPart.capacity = part.capacity
            newPart.capacity_unit = part.capacity_unit
        case "Backplane":
            newPart.storage_interface = part.storage_interface
            newPart.port_type = part.port_type
            break;
        case "GPU":
            break
        case "Cable":
            newPart.cable_end1 = part.cable_end1
            newPart.cable_end2 = part.cable_end2
            break                
        case "Heatsink":
            newPart.socket = part.socket
            newPart.size = part.size
            newPart.active = part.active
            break;
        case "Optic":
            newPart.cable_end1 = part.cable_end1;
            break;
    }
    
    return objectSanitize(newPart, false) as PartSchema
}

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
            if (!/PNX([0-9]{7})+/.test(nxid)) {
                return res.status(400).send("Invalid part ID");
            }
            // Try to add part to database
            let newPart = cleansePart(part)
            // Send part to database
            newPart.created_by = req.user.user_id;
            await Part.create(newPart, (err: MongooseError, part: PartSchema) => {
                if (err) {
                    // Return and send error to client side for prompt
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Shared create options
                let createOptions = {
                    nxid: part.nxid,
                    building: req.body.building ? req.body.building : req.user.building,/*req.user.building,*/
                    location: req.body.location ? req.body.location : "Parts Room",
                    by: req.user.user_id
                }
                // If parts have serial numbers, map one record per serial number
                if(part.serialized&&req.body.part.serials) {
                    let serials = req.body.part.serials as string[]
                    Promise.all(serials.map(async (serial) => {
                        let optionsCopy = JSON.parse(JSON.stringify(createOptions))
                        optionsCopy.serial = serial
                        PartRecord.create(optionsCopy, callbackHandler.callbackHandleError)
                    }))
                }
                // If parts do not have serial numbers, create generic records
                else {
                    if(quantity==undefined)
                        quantity = 0
                    for (let i = 0; i < quantity; i++) {
                        // Create part records to match the quantity and location of the part schema creation
                        PartRecord.create(createOptions, callbackHandler.callbackHandleError)
                    }
                }
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
            const { location, building } = req.query;
            if (req.query.advanced) {
                delete req.query.advanced;
            }
            if(!(req.query.pageSize&&req.query.pageNum))
                return res.status(400).send(`Missing page number or page size`);      
            let pageSize = parseInt(req.query.pageSize as string);
            let pageNum = parseInt(req.query.pageNum as string);
            delete req.query.pageNum
            delete req.query.pageSize
            delete req.query.location
            delete req.query.building
            let req_part = req.query as PartSchema
            // Find parts that match request
            Part.find(req_part)
                .skip(pageSize * (pageNum - 1))
                .limit(pageSize + 1)
                .exec(async (err: CallbackError | null, parts: PartSchema[]) => {
                if (err) {
                    // Database err
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let returnParts = await Promise.all(parts.map(async(part)=>{
                    let count = await PartRecord.count({
                        nxid: part.nxid,
                        next: null,
                        location: location ? location : "Parts Room",
                        building: building ? building : req.user.building
                    });
                    let total_count = await PartRecord.count({
                        nxid: part.nxid,
                        next: null
                    });
                    let tempPart = JSON.parse(JSON.stringify(part))
                    
                    tempPart.quantity = count;
                    tempPart.total_quantity = total_count;
                    return tempPart
                }))
                return res.status(200).json(returnParts);
            })
        } catch (err) {
            // Database error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getPartByID: async (req: Request, res: Response) => {
        try {
            let part = {} as PartSchema
            // Check if NXID
            if (/PNX([0-9]{7})+/.test((req.query.id as string).toUpperCase())) {
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
                location: req.query.location ? req.query.location : "Parts Room",
                next: null
            });
            part = part._doc;
            part.total_quantity = total_quantity;
            part.quantity = quantity;
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
            if(user_id!='all') {
                let user = await User.findById(user_id).exec()
                if(user_id==null||user_id==undefined||user==null)
                    return res.status(400).send("Invalid request")
            }
            let current_date = Date.now();
            // Find each item and check quantities before updating
            let sufficientStock = ""
            let serialQuantityError = ""
            let serializedError = ""
            let duplicateSerial = ""
            let infoError = ""
            // Using hash map for quick search
            let serialMap = new Map<string, boolean>();
            await Promise.all(cart.map(async (item: CartItem) => {
                // Check quantity before
                let info = await Part.findOne({nxid: item.nxid})
                if(info?.serialized&&item.serial) {
                    if(serialMap.has(item.serial)) {
                        duplicateSerial = item.nxid + ": " + item.serial
                        return
                    }
                    serialMap.set(item.serial, true)
                    // Find serialized part
                    let serializedItem = await PartRecord.findOne({
                        nxid: item.nxid,
                        location: "Parts Room",
                        building: req.user.building,
                        next: null,
                        serial: item.serial
                    })
                    // Check if serial number is non existent
                    if(serializedItem==undefined) {
                        serialQuantityError = item.nxid + ": " + item.serial
                        serialMap.delete(item.serial)
                    }
                } else {
                    // Check if part is serialized
                    if(info&&info.serialized) {
                        // Mark as error
                        serializedError = info.nxid
                        return
                    }
                    // Check if part info is non existent
                    if(info==null) {
                        // Mark as error
                        infoError = item.nxid
                        return
                    }
                    // Get quantity
                    let quantity = await PartRecord.count({
                        nxid: item.nxid,
                        location: "Parts Room",
                        building: req.user.building,
                        next: null
                    });
                    // Check stock vs list
                    if (quantity < item.quantity!) {
                        // Insufficient stock
                        sufficientStock = item.nxid
                    }
                }
            }))
            // Check error conditions
            if(sufficientStock!='')
                return res.status(400).send(`Insufficient stock for ${sufficientStock}.`)
            if(serialQuantityError!='')
                return res.status(400).send(`${serialQuantityError} is not available in parts room.`)
            if(serializedError!='')
                return res.status(400).send(`${serializedError} is a serialized part, please specify serial number`)
            if(infoError!='')
                return res.status(400).send(`${serializedError} does not exist.`)
            if(duplicateSerial!='')
                return res.status(400).send(`Duplicate serial ${duplicateSerial} found in request.`)
            // Loop through each item and create new parts record and update old parts record
            await Promise.all(cart.map(async (item: CartItem) => {
                // If part is serialized
                if(item.serial) {
                    // Find matching part
                    let prevPart = await PartRecord.findOne({
                        nxid: item.nxid, 
                        serial: item.serial,
                        location: "Parts Room",
                        building: req.user.building,
                        next: null
                    })
                    // If found, create new record
                    if (prevPart) {
                        PartRecord.create({
                            nxid: item.nxid,
                            owner: user_id,
                            serial: item.serial,
                            location: "Tech Inventory",
                            building: req.user.building,
                            by: req.user.user_id,
                            prev: prevPart._id,
                            next: null,
                            date_created: current_date,
                        }, callbackHandler.updateRecord);
                    }
                }
                else {
                    // Find all matching part records to minimize requests and ensure updates don't conflict when using async part updating
                    let records = await PartRecord.find({
                        nxid: item.nxid,
                        location: "Parts Room",
                        building: req.user.building,
                        next: null
                    });
                    // Loop for quanity of part item
                    for (let j = 0; j < item.quantity!; j++) {
                        // Create new iteration
                        PartRecord.create({
                            nxid: item.nxid,
                            owner: user_id,
                            location: "Tech Inventory",
                            building: req.user.building,
                            by: req.user.user_id,
                            prev: records[j]._id,
                            next: null,
                            date_created: current_date,
                        }, callbackHandler.updateRecord);
                    }
                }
            }))
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

            let sufficientStock = ""
            let serialQuantityError = ""
            let serializedError = ""
            let duplicateSerial = ""
            let infoError = ""
            // Check quantities before updating records
            let serialMap = new Map<string, boolean>();
            await Promise.all(inventory.map(async(item: CartItem) => {
                let info = await Part.findOne({nxid: item.nxid})
                if(info?.serialized&&item.serial) {
                    if(serialMap.has(item.serial)) {
                        duplicateSerial = item.nxid + ": " + item.serial
                        return
                    }
                    serialMap.set(item.serial, true)
                    // Find serialized part
                    let serializedItem = await PartRecord.findOne({
                        nxid: item.nxid,
                        next: null,
                        owner: user_id,
                        serial: item.serial
                    })
                    // Check if serial number is non existent
                    if(serializedItem==undefined) {
                        serialQuantityError = item.nxid + ": " + item.serial
                        serialMap.delete(item.serial)
                    }
                }
                else {
                    // Check if part is serialized
                    if(info&&info.serialized) {
                        // Mark as error
                        serializedError = info.nxid
                        return
                    }
                    // Check if part info is non existent
                    if(info==null) {
                        // Mark as error
                        infoError = item.nxid
                        return
                    }
                    let quantity = await PartRecord.count({
                        nxid: item.nxid,
                        next: null,
                        owner: user_id
                    })
                    // If check in quantity is greater than 
                    // inventory quantity
                    if (quantity < item.quantity!) {
                        // Insufficient stock
                        sufficientStock = item.nxid
                    }
                }
            }))
            // Check error conditions
            if(sufficientStock!='')
                return res.status(400).send(`Insufficient inventory quantity for ${sufficientStock}.`)
            if(serialQuantityError!='')
                return res.status(400).send(`${serialQuantityError} is not in user's inventory.`)
            if(serializedError!='')
                return res.status(400).send(`${serializedError} is a serialized part, please specify serial number`)
            if(infoError!='')
                return res.status(400).send(`${serializedError} does not exist.`)
            if(duplicateSerial!='')
                return res.status(400).send(`Duplicate serial ${duplicateSerial} found in request.`)
            // Iterate through each item and update records
            await Promise.all(inventory.map(async(item: CartItem) => {
                // Get database quantity
                if (item.serial) {
                    let part = await PartRecord.findOne({
                        nxid: item.nxid,
                        next: null,
                        owner: user_id,
                        serial: item.serial
                    })
                    if(part!=null) {
                        PartRecord.create({
                            nxid: item.nxid,
                            next: null,
                            prev: part._id,
                            location: "Parts Room",
                            serial: item.serial,
                            building: req.user.building,
                            by: req.user.user_id,
                            date_created: current_date,
                        }, callbackHandler.updateRecord)
                    }
                }
                else {
                    const records = await PartRecord.find({
                        nxid: item.nxid,
                        next: null,
                        owner: user_id
                    });
                    // Loop through the quantity of the item and 
                    // change records
                    for (let i = 0; i < item.quantity!; i++) {
                        // Create new part record - set prev to old record
                        PartRecord.create({
                            nxid: item.nxid,
                            next: null,
                            prev: records[i]._id,
                            location: "Parts Room",
                            building: req.user.building,
                            by: req.user.user_id,
                            date_created: current_date,
                        }, callbackHandler.updateRecord);
                    }
                }
            }))
            // Success
            res.status(200).send("Successfully checked in.")
        }
        catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    searchParts: async (req: Request, res: Response) => {
        try {
            async function returnSearch(err: CallbackError | null, parts: PartSchema[]) {
                if (err) {
                    // Database err
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Map for all parts
                let returnParts = await Promise.all(parts.map(async (part)=>{
                    // Check parts room quantity
                    let count = await PartRecord.count({
                        nxid: part.nxid,
                        next: null,
                        location: location ? location : "Parts Room",
                        building: building ? building : req.user.building
                    });
                    // Get total quantity
                    let total_count = await PartRecord.count({
                        nxid: part.nxid,
                        next: null
                    });
                    // Copy part
                    let tempPart = JSON.parse(JSON.stringify(part))
                    // Add quantities
                    tempPart.quantity = count;
                    tempPart.total_quantity = total_count;
                    // Return
                    return tempPart
                }))
                return res.status(200).json(returnParts);
            }
            // Search data
            // Limit
            // Page number
            let { searchString, pageSize, pageNum, building, location } = req.query;
            // Find parts
            // Skip - gets requested page number
            // Limit - returns only enough elements to fill page

            // Splice keywords from search string
            if(typeof(searchString)!="string") {
                return res.status(400).send("Search string undefined");
            }
            searchString = stringSanitize(searchString, true)
            
            let fullText = false
            let pp = await Part.findOne(searchString != ''? { $text: { $search: searchString } } : {})
            if(pp!=undefined)
                fullText = true

            if (fullText) {
                // Search data
                Part.find(searchString != ''? { $text: { $search: searchString } } : {})
                // Skip - gets requested page number
                .skip(parseInt(pageSize as string) * (parseInt(pageNum as string) - 1))
                // Limit - returns only enough elements to fill page
                .limit(parseInt(pageSize as string) + 1)
                .exec(returnSearch)
            }
            else {
                let keywords = [searchString]
                keywords = keywords.concat(searchString.split(" "))
                // Use keywords to build search options
                let searchOptions = [] as any
                // Add regex of keywords to all search options
                await Promise.all(keywords.map(async (key) => {
                    searchOptions.push({ "nxid": { $regex: key, $options: "is" } })
                    searchOptions.push({ "name": { $regex: key, $options: "is" } })
                    searchOptions.push({ "manufacturer": { $regex: key, $options: "is" } })
                    searchOptions.push({ "type": { $regex: key, $options: "is" } })
                    searchOptions.push({ "shelf_location": { $regex: key, $options: "is" } })
                    searchOptions.push({ "storage_interface": { $regex: key, $options: "is" } })
                    searchOptions.push({ "port_type": { $regex: key, $options: "is" } })
                    searchOptions.push({ "peripheral_type": { $regex: key, $options: "is" } })
                    searchOptions.push({ "memory_type": { $regex: key, $options: "is" } })
                    searchOptions.push({ "cable_end1": { $regex: key, $options: "is" } })
                    searchOptions.push({ "cable_end2": { $regex: key, $options: "is" } })
                    searchOptions.push({ "chipset": { $regex: key, $options: "is" } })
                    searchOptions.push({ "socket": { $regex: key, $options: "is" } })
                }))
                Part.aggregate([{ $match: { $or: searchOptions } }])
                    .skip(parseInt(pageSize as string) * (parseInt(pageNum as string) - 1))
                    .limit(parseInt(pageSize as string) + 1)
                    .exec(returnSearch)
            }
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

            function updatePartRecords(err: MongooseError, parts: PartSchema[]) {
                if (err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Change every part record
                parts.map((p)=>{  
                    PartRecord.findByIdAndUpdate(p._id, {
                        nxid: updatedPart!.nxid
                    }, callbackHandler.callbackHandleError);
                })
            }
            // Updated part is the old part from database
            if (!/PNX([0-9]{7})+/.test(newPart.nxid ? newPart.nxid : '')) {
                return res.status(400).send("Invalid part ID");
            }


            let updatedPart = await Part.findByIdAndUpdate(part._id, newPart);
            if (updatedPart == null) {
                return res.status(400).send("Part not found.");
            }
            if (part.nxid != updatedPart.nxid) {
                // Update old NXID to new NXID
                PartRecord.find({ nxid: updatedPart.nxid }, updatePartRecords)
            }
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
            let createOptions = {
                nxid,
                location: location,
                building: building,
                prev: null,
                next: null,
                by: req.user.user_id,
            } as PartRecordSchema

            // If asset, make sure asset exists
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
            
            Part.findOne({ nxid }, async (err: MongooseError, part: PartSchema) => {
                if (err)
                    return res.status(500).send("API could not handle your request: " + err);
                if(serials.length > 0) {
                    // Get existing records to check serials
                    let records = await PartRecord.find({nxid, next: null}) as PartRecordSchema[];
                    // Use hashmap for easier and faster checks
                    let serialMap = new Map<string, PartRecordSchema>()
                    // Map array to hashmap
                    records.map((r)=>{
                        serialMap.set(r.serial!, r)
                    })
                    // Set sentinel value
                    let existingSerial = ""
                    // Check all serials 
                    serials.map((serial) => {
                        // If serial exists in hashmap, set sentinel value
                        if (serialMap.has(serial))
                            existingSerial = serial
                    })
                    // If serial already exists, return error
                    if(existingSerial!="")
                        return res.status(400).send(`Serial number ${existingSerial} already in inventory`);
                    // All serials are new, continue
                    serials.map(async (serial) => {
                        // Make copy
                        let createOptionsCopy = JSON.parse(JSON.stringify(createOptions))
                        // Add serial
                        createOptionsCopy.serial = serial
                        // Create PartRecords
                        PartRecord.create(createOptionsCopy, callbackHandler.callbackHandleError);
                    })
                }
                else {
                    for (let i = 0; i < quantity; i++) {
                        // Create new parts records to match the quantity
                        PartRecord.create(createOptions, callbackHandler.callbackHandleError);
                    }
                }
                // Success
                res.status(200).send("Successfully added to inventory")
            });
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
            await Part.findByIdAndDelete(part?._id);
            // Find all associated parts records
            PartRecord.find({
                nxid,
                next: null
            }, (err: MongooseError, parts: PartRecordSchema[]) => {
                if (err) {
                    // Error - don't return so other records will be deleted
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Delete every part record
                parts.map(async (part) => {
                    await PartRecord.findByIdAndUpdate(part._id, { next: 'deleted' })
                })
                res.status(200).send("Successfully deleted part and records");
            })
            const targetPath = path.join(UPLOAD_DIRECTORY, 'images/parts', `${nxid}.webp`)
            if(fs.existsSync(targetPath))
                fs.unlinkSync(targetPath)
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
            // Check role
            if((user_id!=req.user.user_id)&&(req.user.role=="tech"))
                return res.status(403).send("You cannot view another user's inventory");
            // Fetch part records
            PartRecord.find({ next: null, owner: user_id ? user_id : req.user.user_id }, async (err: MongooseError, records: PartRecordSchema[]) => {
                if (err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Store part info
                let cachedRecords = new Map<string, PartSchema>();
                // Unserialized parts and quantities
                let unserializedParts = new Map<string, number>();
                // Serialized parts
                let cartItems = [] as CartItem[]

                await Promise.all(records.map((record) => {
                    // If serialized
                    if(record.serial) {
                        // Push straight to cart items
                        cartItems.push({nxid: record.nxid!, serial: record.serial })
                    }
                    // If unserialized and map already has part
                    else if (unserializedParts.has(record.nxid!)) {
                        // Increment quantity
                        unserializedParts.set(record.nxid!, unserializedParts.get(record.nxid!)! + 1)
                    }
                    // Map does not have part
                    else {
                        // Start at 1
                        unserializedParts.set(record.nxid!, 1)
                    }
                }))
                // Get part info and push as LoadedCartItem interface from the front end
                unserializedParts.forEach((quantity, nxid) => {
                    // Push unserialized parts to array
                    cartItems.push({nxid: nxid, quantity: quantity})
                })
                // Check all cart items
                await Promise.all(cartItems.map(async (item) =>{
                    // Check if part record cache already contains part info
                    if (!cachedRecords.has(item.nxid)) {
                        // Set temp value
                        cachedRecords.set(item.nxid, {})
                        // Find part info
                        let part = await Part.findOne({nxid: item.nxid})
                        // If part info found
                        if(part) {
                            // Set new value
                            cachedRecords.set(item.nxid, part)
                        }
                        // Part info not found
                        else {
                            // Error - reset 
                            cachedRecords.delete(item.nxid)
                        }
                    }
                }))
                // Map part info to array (Maps can't be sent through Express/HTTP ???)
                let parts = Array.from(cachedRecords, (record) => {
                    return { nxid: record[0], part: record[1]}
                })
                // Send response
                res.status(200).json({ parts: parts, records: cartItems})
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
            }, (err: Mongoose, record: PartRecordSchema[]) => {
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
            PartRecord.find(params, (err: Mongoose, record: PartRecordSchema[]) => {
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
            if(record == null) {
                return res.status(400).send("Record not found");
            }
            // Create array of part history
            let history = [record]
            // Loop until previous record is false
            while (record.prev != null) {
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
            // Get params from request
            let { from, to, quantity } = req.body
            from.next = null
            to.next = null
            to.by = req.user.user_id
            // Check NXIDs
            if(from.nxid != to.nxid) {
                return res.status(400).send("Mismatched nxids");
            }
            // Switch for setting location
            switch (to.owner) {
                case 'all':
                    // All techs
                    to.location = 'All Techs'
                    break;
                case 'testing':
                    // Testing center
                    to.location = 'Testing Center'
                    break;
                case 'sold':
                    if(!to.ebay)
                        return res.status(400).send("Ebay order ID not present");
                    to.next = 'sold'
                    to.location = 'sold'
                    break;
                case 'lost':
                    if(req.user.role!='admin'&&req.user.role!='inventory')
                        return res.status(400).send("You do not have permissions to mark parts as lost");
                    to.next = 'lost'
                    to.location = 'lost'
                    break;
                case 'broken':
                    if(req.user.role!='admin'&&req.user.role!='inventory')
                        return res.status(400).send("You do not have permissions to mark parts as broken");
                    to.next = 'broken'
                    to.location = 'broken'
                    break;
                case 'deleted':
                    if(req.user.role!='admin'&&req.user.role!='inventory')
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
            if(to.owner!='sold')
                delete to.ebay
            // Get records
            let fromRecords = await PartRecord.find(from)
            // Check quantities
            if (fromRecords.length >= quantity) {
                // Create and update records
                for (let i = 0; i < quantity; i++) {
                    to.prev = fromRecords[i]._id
                    PartRecord.create(to, callbackHandler.updateRecord)
                }
                // Return
                return res.status(200).send("Success");
            } else {
                // Invalid quantities
                return res.status(400).send("Invalid quantities");
            }

        } catch (err) {
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
    }
};

export default partManager;

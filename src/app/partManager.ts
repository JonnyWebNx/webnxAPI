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
import { AssetSchema, CartItem, InventoryEntry, PartRecordSchema } from "./interfaces.js";
import mongoose, { CallbackError, Mongoose, MongooseError } from "mongoose";
import { Request, Response } from "express";
import path from 'path';
import { PartSchema, PartQuery } from "./interfaces.js";
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
	    newPart.mainboard_con = part.mainboard_con
            newPart.peripheral_type = part.peripheral_type
            newPart.num_ports = part.num_ports
	    if(part.port_type)
            	newPart.port_type = part.port_type
            break
        case "Storage":
            newPart.storage_type = part.storage_type
            newPart.size = part.size
            newPart.capacity = part.capacity
            newPart.capacity_unit = part.capacity_unit
        case "Backplane":
            newPart.port_type = part.port_type
            newPart.num_ports = part.num_ports
            break;
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
        default:
            newPart.consumable = part.consumable ? true : false
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
                    building: req.body.building ? req.body.building : req.user.building,
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
                else if(!part.serialized){
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
            // Typecast part
            let req_part = req.query
            // Create query part
            let search_part = {} as PartQuery
            // Copy fields from typecasted part, convert array into $all query
            Object.keys(req_part).forEach((k)=>{
                // early return for empty strings
                if(req_part[k]=='')
                    return
                // ALlow array partial matches
                if(Array.isArray(req_part[k])&&!(req_part[k]!.length==0)) {
                    // Generate regex for each array field
                    let arr = (req_part[k] as string[]).map((v)=>{
                        return new RegExp(v, "i") 
                    })
                    // Use $all with array of case insensitive regexes
                    return search_part[k] = { $all: arr }
                }
                // Check if value is integer
                if(typeof(req_part[k])=='string'&&!isNaN(req_part[k] as any)) {
                    // Parse integer
                    return search_part[k] = parseInt(req_part[k] as string)
                }
                // Check if not boolean 
                if(!(req_part[k]=='true')&&!(req_part[k]=='false'))
                    // Create case insensitive regex
                    return search_part[k] = { $regex: req_part[k], $options: 'i' } 
                // Any value here is likely a boolean
                search_part[k] = req_part[k]
            })
            Part.find(search_part)
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
                    if(info&&info.serialized&&info.nxid) {
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
                    let partInfo = await Part.findOne({nxid: item.nxid})
                    // Find all matching part records to minimize requests and ensure updates don't conflict when using async part updating
                    let records = await PartRecord.find({
                        nxid: item.nxid,
                        location: "Parts Room",
                        building: req.user.building,
                        next: null
                    });
                    // Loop for quanity of part item
                    for (let j = 0; j < item.quantity!; j++) {
                        // Check if consumable
                        if(partInfo&&partInfo.consumable)
                            // Mark as consumed
                            PartRecord.findByIdAndUpdate(records[j]._id, {next: 'consumed', by: req.user.user_id, date_replaced: current_date}, callbackHandler.callbackHandleError)
                        else
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
                    if(info&&info.serialized&&info.nxid) {
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
                    searchOptions.push({ "memory_gen": { $regex: key, $options: "is" } })
                    searchOptions.push({ "frequency": { $regex: key, $options: "is" } })
                    searchOptions.push({ "size": { $regex: key, $options: "is" } })
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
            
            let partInfo = await Part.findOne({nxid: nxid}) as PartSchema
            if(partInfo==null)
                return res.status(400).send("Part not found");
            if(partInfo.consumable&&location!="Parts Room")
                return res.status(400).send("Unable to add consumables outside parts room");

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
            // Get data from request
            let { old_owner, new_owner } = req.body
            let parts = req.body.parts as InventoryEntry[]

            // Inventory check
            let inventoryCheck = await PartRecord.find({owner: old_owner, next: null})
            let inventoryHash = new Map<string, InventoryEntry>()

            // Store whether or not part is serialized in map
            let partSerialized = new Map<string, boolean>();

            // Error arrays
            let notEnough = [] as string[]
            let missingSerial = [] as string[]
            let partNotFound = [] as string[]
            let serialNotInInv = [] as string[]
            let duplicateEntry = [] as string[]
            let serialNotNeeded = [] as string[]
            let duplicateSerial = [] as string[]
            let nxidMissing = false
            
            // Check for duplicates
            parts.map((p: InventoryEntry, i)=>{
                // If search index does not equal current index
                if(parts.findIndex((k)=>k.nxid==p.nxid)!=i) {
                    duplicateEntry.push(p.nxid?p.nxid:"Undefined NXID")
                    return false
                }
                return true
            })
            if(duplicateEntry.length>0)
                return res.status(400).send("Duplicate NXIDs in request: "+duplicateEntry.join(', '));
            // Turn array into hashmap
            inventoryCheck.map((record)=>{
                // Create boilerplate
                let invEntry = { unserialized: 0, serials: [""]}
                // Check if hashtable already has entries
                if(inventoryHash.has(record.nxid!))
                    // Load existing entries
                    invEntry = inventoryHash.get(record.nxid!)!
                // If record has serial number
                if(record.serial)
                    // Push to serials
                    invEntry.serials.push(record.serial)
                else
                    // Increment number of unserialized
                    invEntry.unserialized++
                inventoryHash.set(record.nxid!, invEntry)
            })

            // Check all parts in list for inventory
            await Promise.all(parts.map(async (entry: InventoryEntry, i) =>{
                // Chech if entry is a duplicate
                if(parts.findIndex((k)=>k.nxid==entry.nxid)!=i)
                    duplicateEntry.push(entry.nxid?entry.nxid:"Undefined NXID")
                // Check if NXID is in request
                if(!entry.nxid)
                    return nxidMissing = true
                // Check if part info has been fetched
                if(!partSerialized.has(entry.nxid)) {
                    // Fetch part info
                    let partInfo = await Part.findOne({nxid: entry.nxid})
                    // If not found, push to errors
                    if(partInfo==null)
                        return partNotFound.push(entry.nxid)
                    // Part found, add to map
                    partSerialized.set(entry.nxid, partInfo.serialized ? true : false)
                }
                // Check if part is serialized
                let serialized = partSerialized.get(entry.nxid)
                // Check if inventory has part
                if(!inventoryHash.has(entry.nxid))
                    // Push error
                    return notEnough.push(entry.nxid)
                // Get existing inventory entry
                const existingInv = inventoryHash.get(entry.nxid)!
                // If serialized
                if(serialized) {
                    // Check if all parts have serials
                    if(entry.unserialized&&entry.unserialized>0&&(entry.newSerials?.length!=entry.unserialized))
                        // Push error
                        missingSerial.push(entry.nxid)
                    // Make sure all serials on request are in inventory
                    await Promise.all(entry.serials.map(async (s)=>{
                        if(!existingInv.serials.includes(s))
                            // Push error
                            serialNotInInv.push(entry.nxid+": "+s)
                    }))
                    // If there are new serial numbers
                    if(entry.newSerials)
                        // Check if they are unique
                        await Promise.all(entry.newSerials.map(async(s)=>{
                            let existingSerial = await PartRecord.findOne({nxid: entry.nxid, serial: s, next: null})
                            // Check if already exists
                            if(existingSerial)
                                // Push error
                                duplicateSerial.push(entry.nxid+": "+s)
                        }))
                    return
                }
                // Check for unserialized records
                let unserializedRecordsCount = await PartRecord.count({nxid: entry.nxid, owner: old_owner, next: null, serial: undefined})
                // Check quantities
                if(unserializedRecordsCount<entry.unserialized)
                    notEnough.push(entry.nxid)
                // Check if serials are present but not required
                if((entry.serials.length>0||(entry.newSerials&&entry.newSerials.length>0))&&new_owner!='sold')
                   serialNotNeeded.push(entry.nxid) 
                // Not serialized
                // Check quantities
                if(existingInv.unserialized<entry.unserialized)
                    // Push error
                    notEnough.push(entry.nxid)
            }))
            // Return to client with errors if present
            if(duplicateEntry.length>0)
                return res.status(400).send("Duplicate NXIDs in request: "+duplicateEntry.join(', '));
            if(partNotFound.length>0)
                return res.status(400).send("Part info not found for: "+partNotFound.join(', '));
            if(notEnough.length>0)
                return res.status(400).send("Not enough in inventory: "+notEnough.join(', '));
            if(missingSerial.length>0)
                return res.status(400).send("Serial numbers missing for: "+missingSerial.join(', '))
            if(serialNotInInv.length>0)
                return res.status(400).send("Serial not present in inventory: "+serialNotInInv.join(', '))
            if(duplicateSerial.length>0)
                return res.status(400).send("Serial number already exists for: "+duplicateSerial.join(', '))
            if(serialNotNeeded.length>0)
                return res.status(400).send("Serials not necessary for: "+serialNotNeeded.join(', '))
            // Check if location is valid
            let to = {} as PartRecordSchema
            to.owner = new_owner ? new_owner as string : "";
            to.next = null
            switch (new_owner) {
                case 'all':
                    // All techs
                    to.location = 'All Techs'
                    break;
                case 'testing':
                    // Testing center
                    to.location = 'Testing Center'
                    break;
                case 'sold':
                    if(!req.body.orderID)
                        return res.status(400).send("Ebay order ID not present");
                    to.ebay = req.body.orderID
                    to.next = 'sold'
                    to.location = 'sold'
                    break;
                case 'lost':
                    if(!(req.user.roles.includes('admin')||req.user.roles.includes('clerk')))
                        return res.status(400).send("You do not have permissions to mark parts as lost");
                    to.next = 'lost'
                    to.location = 'lost'
                    break;
                case 'broken':
                    if(!(req.user.roles.includes('admin')||req.user.roles.includes('clerk')))
                        return res.status(400).send("You do not have permissions to mark parts as broken");
                    to.next = 'broken'
                    to.location = 'broken'
                    break;
                case 'deleted':
                    if(!(req.user.roles.includes('admin')||req.user.roles.includes('clerk')))
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
            await Promise.all(parts.map(async (entry)=>{
                // If ebay order
                if(to.ebay) {
                    // Get unserialized
                    let serialized = partSerialized.get(entry.nxid!)
                    let unserializedRecords = [] as PartRecordSchema[]
                    // If unserialized, fetch unserialized records for updating
                    if(!serialized)
                        unserializedRecords = await PartRecord.find({nxid: entry.nxid, serial: undefined, owner: old_owner, next: null})
                    // Check quantities
                    if(!serialized&&unserializedRecords.length<entry.serials.length)
                        return
                    entry.serials.map(async (s, index)=>{
                                                // Clone to object
                        let newRecord = structuredClone(to)
                        // Set serial
                        newRecord.nxid = entry.nxid
                        newRecord.serial = s
                        if(serialized) {
                            // Find sepcific serial
                            PartRecord.findOne({nxid: entry.nxid, serial: s, owner: old_owner, next: null}, (err: MongooseError, oldRecord: PartRecordSchema)=>{
                                if(err)
                                    return handleError(err)
                                newRecord.prev = oldRecord._id
                                // Create and upate
                                PartRecord.create(newRecord, callbackHandler.updateRecord)
                            })
                        }
                        else {
                            // Previous record unserialized
                            newRecord.prev = unserializedRecords[index]._id
                            // Create new part record and update old one
                            PartRecord.create(newRecord, callbackHandler.updateRecord)
                        }
                    })
                }
                else {
                    entry.serials.map(async (s)=>{
                        // Clone to object
                        let newRecord = structuredClone(to)
                        // Set serial
                        newRecord.nxid = entry.nxid
                        newRecord.serial = s
                        PartRecord.findOne({nxid: entry.nxid, serial: s, owner: old_owner, next: null}, (err: MongooseError, oldRecord: PartRecordSchema)=>{
                            if(err)
                                return handleError(err)
                            newRecord.prev = oldRecord._id
                            PartRecord.create(newRecord, callbackHandler.updateRecord)
                        })
                    })
                    // Update unserialized records
                    let unserializedRecords = [] as PartRecordSchema[]
                    if(entry.unserialized>0)
                        unserializedRecords = await PartRecord.find({nxid: entry.nxid, serial: undefined, owner: old_owner, next: null})
                    if(entry.unserialized>unserializedRecords.length)
                        return
                    for (let i = 0; i < entry.unserialized; i++) {
                        // Clone to object
                        let newRecord = structuredClone(to)
                        newRecord.nxid = entry.nxid
                        // If newSerials, add serial to object
                        if(entry.newSerials)
                            newRecord.serial = entry.newSerials[i]
                        // Find objects with undefined serials
                        newRecord.prev = unserializedRecords[i]._id
                        PartRecord.create(newRecord, callbackHandler.updateRecord)
                    }
                }
            }))
            return res.status(200).send("Success");
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    deleteFromPartsRoom: async (req: Request, res: Response) => {
        try{
            // Get request params
            console.log(req.query)
            let nxid = req.query.nxid as string
            // Parse integers
            let new_quantity = parseInt(req.query.new_quantity as string)
            let building = req.query.building?parseInt(req.query.building as string):req.user.building
            // Check request
            if(!nxid||!/PNX([0-9]{7})+/.test(nxid)||new_quantity<0)
                return res.status(400).send("Invalid request");
            let partInfo = await Part.findOne({nxid})
            if(partInfo?.serialized)
                return res.status(400).send("Cannot delete serialized records");
            // Find parts room records
            PartRecord.find({nxid: nxid, building: building, location: "Parts Room", next: null}, async (err: MongooseError, oldRecords: PartRecordSchema[])=>{
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
    // moveParts: async (req: Request, res: Response) => {
    //     try {
    //         // Get params from request
    //         let { from, to, quantity } = req.body
    //         from.next = null
    //         to.next = null
    //         to.by = req.user.user_id
    //         // Check NXIDs
    //         if(from.nxid != to.nxid) {
    //             return res.status(400).send("Mismatched nxids");
    //         }
    //         // Switch for setting location
    //         switch (to.owner) {
    //             case 'all':
    //                 // All techs
    //                 to.location = 'All Techs'
    //                 break;
    //             case 'testing':
    //                 // Testing center
    //                 to.location = 'Testing Center'
    //                 break;
    //             case 'sold':
    //                 if(!to.ebay)
    //                     return res.status(400).send("Ebay order ID not present");
    //                 to.next = 'sold'
    //                 to.location = 'sold'
    //                 break;
    //             case 'lost':
    //                 if(!(req.user.roles.includes('admin')||req.user.roles.includes('clerk')))
    //                     return res.status(400).send("You do not have permissions to mark parts as lost");
    //                 to.next = 'lost'
    //                 to.location = 'lost'
    //                 break;
    //             case 'broken':
    //                 if(!(req.user.roles.includes('admin')||req.user.roles.includes('clerk')))
    //                     return res.status(400).send("You do not have permissions to mark parts as broken");
    //                 to.next = 'broken'
    //                 to.location = 'broken'
    //                 break;
    //             case 'deleted':
    //                 if(!(req.user.roles.includes('admin')||req.user.roles.includes('clerk')))
    //                     return res.status(400).send("You do not have permissions to mark parts as deleted");
    //                 to.next = 'deleted'
    //                 to.location = 'deleted'
    //                 break;
    //             // Add more cases here if necessary...
    //             default:
    //                 if (!mongoose.Types.ObjectId.isValid(to.owner))
    //                     return res.status(400).send("Invalid id")
    //                 // Check if user exists
    //                 let findUser = await User.findOne({ _id: to.owner })
    //                 // Return if user not found
    //                 if (findUser==null)
    //                     return res.status(400).send("User not found")
    //                 
    //                 to.location = 'Tech Inventory'
    //                 to.building = findUser.building
    //         }
    //         if(to.owner!='sold')
    //             delete to.ebay
    //         // Get records
    //         let fromRecords = await PartRecord.find(from)
    //         // Check quantities
    //         if (fromRecords.length >= quantity) {
    //             // Create and update records
    //             for (let i = 0; i < quantity; i++) {
    //                 to.prev = fromRecords[i]._id
    //                 PartRecord.create(to, callbackHandler.updateRecord)
    //             }
    //             // Return
    //             return res.status(200).send("Success");
    //         } else {
    //             // Invalid quantities
    //             return res.status(400).send("Invalid quantities");
    //         }

    //     } catch (err) {
    //         handleError(err)
    //         return res.status(500).send("API could not handle your request: " + err);
    //     }
    // },
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

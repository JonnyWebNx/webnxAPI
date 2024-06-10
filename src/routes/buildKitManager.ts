import PartRecord from '../model/partRecord.js'
import User from "../model/user.js";
import handleError from "../util/handleError.js";
import { BuildKitSchema, CartItem, InventoryEntry, NotificationTypes, PartRequestSchema } from "../interfaces.js";
import { CallbackError, MongooseError } from "mongoose";
import { Request, Response } from "express";
import {
    kioskHasInInventoryAsync,
    getAllKioskNames,
    combineAndRemoveDuplicateCartItems,
    checkPartThreshold,
} from '../methods/partMethods.js';
import { updatePartsAsync, updatePartsAddSerialsAsync, partRecordsToCartItems, findExistingSerial, getAddedAndRemoved } from '../methods/assetMethods.js';
import { getNumPages, getTextSearchParams } from '../methods/genericMethods.js';
import { stringSanitize } from '../util/sanitize.js';
import PartRequest from '../model/partRequest.js';
import BuildKit from '../model/buildKit.js';
import { pushPayloadToRole, sendNotificationToUser } from '../methods/notificationMethods.js';

const buildKitManager = {
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
            .then(()=>{
                cartItems.filter((v, i, arr)=>i==arr.findIndex((j)=>j.nxid==v.nxid)).map((ci)=>{
                    checkPartThreshold(ci.nxid, req.user.building)
                })
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
                for(let p of entry.parts as any) {
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
                let nxids = [] as string[]
                // Update the parts
                await Promise.all(list.map((item: {kiosk: string, parts: InventoryEntry[]})=>{
                    // Get parts from kiosk
                    let searchOptions = {
                        next: null,
                        location: item.kiosk,
                        building: req.user.building
                    }
                    nxids = nxids.concat(item.parts.map((ie)=>{
                        return ie.nxid!
                    }))
                    // Update em ayyyyyy
                    return updatePartsAddSerialsAsync(createOptions, searchOptions, item.parts)
                }))
                res.status(200).send("Success.")
                
                nxids.filter((v,i,arr)=>i==arr.indexOf(v)).map((nxid)=>{
                    checkPartThreshold(nxid, req.user.building)
                })
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
                cartItems.filter((v,i,arr)=>i==arr.findIndex((j)=>j.nxid==v.nxid)).map((ci)=>{
                    checkPartThreshold(ci.nxid, req.user.building)
                })
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
                return updatePartsAsync(createOptions, searchOptions, item.parts, false)
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
}

export default buildKitManager

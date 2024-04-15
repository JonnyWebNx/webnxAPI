import { PartRecordSchema, BoxSchema } from "../interfaces.js"
import { Request, Response } from "express";
import handleError from "../util/handleError.js";
import { isValidObjectId } from "mongoose";
import PartRecord from "../model/partRecord.js";
import { getAddedAndRemoved, partRecordsToCartItems, updatePartsAsync, userHasInInventoryAsync } from "../methods/assetMethods.js";
import { CallbackError } from "mongoose";
import { cartItemsValidAsync, sanitizeCartItems } from "../methods/partMethods.js";
import callbackHandler from "../util/callbackHandlers.js";
import { getNumPages, getPageNumAndSize, getTextSearchParams, objectToRegex } from "../methods/genericMethods.js";
import { isLocationValid } from "../methods/palletMethods.js";
import Box from "../model/box.js";
import { boxesAreSimilar, cleanseBox, getBoxSearchRegex, isValidBoxTag, returnBox, returnBoxHistory, returnBoxSearch } from "../methods/boxMethods.js";


const boxManager = {
    migrateBox: async (req: Request, res: Response) => {
        try {
            // Cleanse box 
            let box_tag = req.body.box_tag as string
            let shelf = "Motherboard Cage"
            // Get parts in box
            let parts = sanitizeCartItems(req.body.parts)
            let date_created = new Date()
            // Try and find existing box
            let existingBox = await Box.findOne({box_tag})
            if(!existingBox) {
                let box = {
                    box_tag,
                    by: req.user.user_id,
                    date_created: date_created,
                    building: 3,
                    next: null,
                    prev: null,
                    notes: "Automatically migrated from spreadsheet",
                    location: shelf,
                } as BoxSchema
                await Box.create(box)
            }
            // Create all part records
            let createOptions = {
                building: 3,
                location: "Box",
                box_tag: box_tag,
                by: req.user.user_id,
                date_created: date_created,
                prev: null,
                next: null
            }
            await updatePartsAsync(createOptions, {}, parts, true)
            console.log(`Created box ${box_tag} with ${parts.length} parts.`)
            res.status(200).send("Success");
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    createBox: async (req: Request, res: Response) => {
        try {
            // Cleanse box 
            let box = cleanseBox(req.body.box as BoxSchema)
            // Get parts in box
            let parts = sanitizeCartItems(req.body.parts)
            // Check if input is valid
            if(!box||!isValidBoxTag(box.box_tag)||!isLocationValid(box.location))
                return res.status(400).send("Invalid request");
            // Try and find existing box
            let existingBox = await Box.findOne({box_tag: box.box_tag})
            // Return error if box already exists
            if(existingBox!=null)
                return res.status(400).send("Box already exists.");
            // Get user info
            box.by = req.user.user_id as string
            // Get current date
            box.date_created = new Date()
            // Create box
            Box.create(box)
            .then(async (newBox: BoxSchema)=>{
                let date = newBox.date_created
                // Create all part records
                let createOptions = {
                    building: newBox.building,
                    location: "Box",
                    box_tag: newBox.box_tag,
                    by: req.user.user_id,
                    date_created: date,
                    prev: null,
                    next: null
                }
                await updatePartsAsync(createOptions, {}, parts, true)
                res.status(200).send("Success");
            })
            .catch((err)=>{
                handleError(err)
                return res.status(500).send("API could not handle your request: " + err);
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getBoxes: async (req: Request, res: Response) => {
        try {
            // Parse search info
            let { pageSize, pageSkip } = getPageNumAndSize(req)
            // Get box object from request
            let box = objectToRegex(cleanseBox(req.query as unknown as BoxSchema));
            box.next = null;
            let numBoxes = await Box.count(box)
            let numPages = getNumPages(pageSize, numBoxes)
            // Send request to database
            Box.find(box)
                .skip(pageSkip)
                .limit(pageSize)
                .exec(returnBoxSearch(res, numPages, numBoxes))
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    getBoxByID: async (req: Request, res: Response) => {
        try {
            let id = req.query.id as string
            // Check if it is a box tag
            if(isValidBoxTag(id))
                Box.findOne({box_tag: id, next: null}, returnBox(res))
            // Try to find by ID
            else
                Box.findById(id, returnBox(res))
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    searchBoxes: async (req: Request, res: Response) => {
        try {
            // Search data
            // Limit
            // Page skip
            let { searchString, pageSize, pageSkip } = getTextSearchParams(req);
            // Find parts
            if(searchString == "") {
                // Count all boxes
                let numBoxes = await Box.count({next: null})
                // Calc number of pages
                let numPages = getNumPages(pageSize, numBoxes)
                // Get all boxes
                Box.find({next: null})
                    .sort({box_tag:1})
                    // Skip - gets requested page number
                    .skip(pageSkip)
                    // Limit - returns only enough elements to fill page
                    .limit(pageSize)
                    // Return search to user
                    .exec(returnBoxSearch(res, numPages, numBoxes))
                return
            }
            // Get keyword regex
            let { regexKeywords, relevanceScore } = getBoxSearchRegex(searchString)
            // Create aggregate pipeline query
            let aggregateQuery = [
                {
                    $match:{
                        $and: [
                            {
                                $or: regexKeywords
                            },
                            { next: null}
                        ]
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
            let countQuery = await Box.aggregate(aggregateQuery).count("numBoxes")
            // This is stupid but it works
            let numBoxes = countQuery.length > 0&&countQuery[0].numBoxes ? countQuery[0].numBoxes : 0
            // Get num pages
            let numPages = getNumPages(pageSize, numBoxes)
            // Find boxes 
            Box.aggregate(aggregateQuery)
                .skip(pageSkip)
                .limit(pageSize)
                .exec(returnBoxSearch(res, numPages, numBoxes))
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    updateBox: async (req: Request, res: Response) => {
        try {
            // Get data from request body
            let { box, parts, correction } = req.body;
            // Check if box is valid
            if (!isValidBoxTag(box.box_tag)||!(box.box_tag)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            // Save current time for updates
            let current_date = Date.now();
            box = box as BoxSchema
            // Prep box for updates
            box.by = req.user.user_id;
            box.date_updated = current_date;
            box = cleanseBox(box)
            // Find an existing box
            let existingBox = await Box.findOne({box_tag: box.box_tag, next: null})
            // Check if existing box is null
            if(existingBox==null) {
                // Return error
                return res.status(400).send("Could not find box to update");
            }
            // Get part records that are currently on asset
            let existingParts = await PartRecord.find({ box_tag: box.box_tag, next: null})
            parts = sanitizeCartItems(parts)
            if(!(await cartItemsValidAsync(parts)))
                return res.status(400).send("Error in updated parts list");

            let { added, removed, error } = getAddedAndRemoved(parts, existingParts)
            if(error==true)
                return res.status(400).send("Error in updated parts list");
            // Make sure user has parts in their inventory
            if(correction!=true) {
                let hasInventory = await userHasInInventoryAsync(req.user.user_id, added)
                if(!hasInventory)
                    return res.status(400).send("Added parts on request not found in user inventory");
            }
            // Put removed parts into user inventory
            let removedOptions = {
                owner: req.user.user_id,
                building: req.user.building,
                location: "Tech Inventory",
                by: req.user.user_id,
                date_created: current_date,
                next: null,
            } as PartRecordSchema
            // Put added parts on box 
            let addedOptions = {
                box_tag: box.box_tag,
                building: box.building,
                location: "Box",
                date_created: current_date,
                by: req.user.user_id,
                next: null,
            } as PartRecordSchema
            // Filter by box tag
            let boxSearchOptions = {
                box_tag: box.box_tag,
                next: null
            }
            // Filter by user id
            let userSearchOptions = {
                owner: req.user.user_id,
                next: null
            }
            // Mark removed parts as deleted
            if(correction==true) {
                // Delete removed parts
                delete removedOptions.owner
                removedOptions.location = 'deleted'
                removedOptions.next = 'deleted'
            }
            // Update removed parts
            await updatePartsAsync(removedOptions, boxSearchOptions, removed, false)
            // Update added parts
            await updatePartsAsync(addedOptions, userSearchOptions, added, correction==true)
            // Update the asset object and return to user before updating parts records
            let getBox = JSON.parse(JSON.stringify(await Box.findOne({box_tag: box.box_tag, next: null}))) as BoxSchema
            // Check if boxes are similar
            if(!boxesAreSimilar(box, getBox)) {
                // Boxes are not similar
                delete box._id
                box.prev = getBox._id
                box.date_created = current_date
                box.by = req.user.user_id
                delete box.date_updated
                box.prev_location = getBox.location
                // Create new box
                Box.create(box, (err: CallbackError, new_box: BoxSchema) => {
                    if (err) {
                        handleError(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    // Update old box 
                    Box.findByIdAndUpdate(new_box.prev, { next: new_box._id, date_replaced: current_date }, returnBox(res))
                })
            }
            else {
                // Boxes are similar
                // Check if parts were added or removed
                if(added.length>0||removed.length>0) {
                    // If parts were added or removed, set date_updated to current date
                    await Box.findByIdAndUpdate(box._id, { date_updated: current_date })
                    box.date_updated = current_date
                }
                // Return box
                res.status(200).json(box)
            }
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    getPartsOnBox: async (req: Request, res: Response) => {
        try {
            // Parse box_tag
            const box_tag = req.query.box_tag as string
            // Check if valid
            if (!box_tag||!isValidBoxTag(box_tag))
                return res.status(400).send("Invalid request");
            // Find all parts records associated with box tag
            PartRecord.find({box_tag, next: null}, async (err: CallbackError, pRecords: PartRecordSchema[]) => {
                // If mongoose returns error
                if (err) {
                    // Handle error
                    handleError(err)
                    // Return to client
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let parts = partRecordsToCartItems(pRecords)
                // Return to client
                res.status(200).json(parts)
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    deleteBox: async (req: Request, res: Response) => {
        try {
            const box_tag = req.query.box_tag as string
            if (!box_tag||!isValidBoxTag(box_tag))
                return res.status(400).send("Invalid request");
            Box.findOne({box_tag, next: null})
            .then(async (box: BoxSchema|null)=>{
                if(!box)
                    return res.status(400).send("Box not found.");
                // Find all parts records associated with box tag
                let records = await PartRecord.find({ box_tag, next: null,})   
                let current_date = Date.now()
                let cartItems = partRecordsToCartItems(records)
                let newInfo = {
                    next: 'deleted',
                    building: box.building,
                    box_tag: box.box_tag,
                    location: "Box",
                    date_created: current_date,
                    by: req.user.user_id
                }
                // Find all records associated with box 
                await updatePartsAsync(newInfo, { box_tag, next: null,}, cartItems, false)
                // Find box 
                let newBox = JSON.parse(JSON.stringify(box))
                newBox.prev = newBox._id
                newBox.next = "deleted"
                newBox.date_created = new Date(current_date)
                newBox.prev_location = box.location
                delete newBox._id
                // Create new iteration of box 
                Box.create(box, callbackHandler.updateBoxAndReturn(res))
            })
            .catch((err)=>{
                res.status(500).send("API could not handle your request: "+err);
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    
    getBoxHistory: async (req: Request, res: Response) => {
        try {
            // Get ID from query string
            let id = req.query.id as string
            // Get page num and page size
            let { pageNum, pageSize } = getPageNumAndSize(req)
            // Check if ID is null or doesn't match ID type
            if (!id||(!isValidBoxTag(id)&&!isValidObjectId(id)))
                return res.status(400).send("Invalid request");
            // If NXID
            if (isValidBoxTag(id)) {
                Box.findOne({box_tag: id, next: null}, returnBoxHistory(pageNum, pageSize, res))
            }
            // If mongo ID
            else {
                Box.findById(id, returnBoxHistory(pageNum, pageSize, res))
            }
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
}

export default boxManager

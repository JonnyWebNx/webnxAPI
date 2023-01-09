import Asset from "../model/asset.js";
import PartRecord from "../model/partRecord.js";
import Part from "../model/part.js";
import handleError from "../config/mailer.js";
import callbackHandler from "../middleware/callbackHandlers.js";
import { Request, Response } from "express";
import { AssetSchema, CartItem, PartRecordSchema } from "./interfaces.js";
import { CallbackError } from "mongoose";
import partRecord from "../model/partRecord.js";

const assetManager = {
    addUntrackedAsset: async (req: Request, res: Response) => {
        try {
            // Get asset from request
            let asset = req.body.asset as AssetSchema
            let parts = req.body.parts as CartItem[]
            // Return if user is kiosk
            if(req.user.role=="kiosk")
                return res.status(401).send("Kiosk cannot create assets")
            // Check for required fields
            if (!(asset.asset_tag&&asset.asset_type)||!/WNX([0-9]{7})+/.test(asset.asset_tag)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            let existingAsset = await Asset.findOne({asset_tag: asset.asset_tag})
            if(existingAsset)
                return res.status(400).send("Asset tag already in use");
            // Remove date created if present
            delete asset.date_created;
            // Set by attribute to requesting user
            asset.by = req.user.user_id;
            /**
             * @TODO figure out how to handle parts records when creating assets
             */
            for (const part of parts) {
                for (let i = 0; i < part.quantity; i++) {
                    await PartRecord.create({
                        nxid: part.nxid,
                        building: req.user.building,
                        location: "Asset",
                        asset_tag: asset.asset_tag,
                        by: req.user.user_id,
                    })
                }
            }
            // Create a new asset
            Asset.create(asset, (err, record) => {
                if (err){
                    handleError(err)            
                    res.status(500).send("API could not handle your request: " + err);
                }
                else
                    res.status(200).json(record);
            });
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    getAssets: async (req: Request, res: Response) => {
        try {
            // get object from request
            let asset = req.query;
            // Clear unnecessary param
            if (req.query.advanced) {
                delete req.query.advanced;
            }
            // Send request to database
            Asset.find(asset, (err: CallbackError, record: PartRecordSchema) => {
                if (err)
                    res.status(500).send("API could not handle your request: " + err);
                else
                    res.status(200).json(record);
            });
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    getAssetByID: async (req: Request, res: Response) => {
        try {
            // Get id from query
            const id = req.query.id as string
            // Test regex for NXID
            if (/WNX([0-9]{7})+/.test(id)||id=='test') {
                // Find by NXID
                Asset.findOne({asset_tag: id}, (err: CallbackError, record: AssetSchema) => {
                    if (err)
                        res.status(500).send("API could not handle your request: " + err);
                    else
                        res.status(200).json(record);
                });
            }
            // If id is not NXID
            else {
                // Find by mongo ID
                Asset.findById(id, (err: CallbackError, record: AssetSchema) => {
                    if (err)
                        res.status(500).send("API could not handle your request: " + err);
                    else
                        res.status(200).json(record);
                });
            }
            
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    searchAssets: async (req: Request, res: Response) => {
        try {

            // Search data
            // Limit
            // Page number
            const searchString = req.query.searchString? req.query.searchString as string : ""
            const pageSize = req.query.pageSize? parseInt(req.query.pageSize as string) : 25
            const pageNum = req.query.pageNum? parseInt(req.query.pageNum as string) : 1
            // Find parts
            // Skip - gets requested page number
            // Limit - returns only enough elements to fill page

            // Splice keywords from search string
            let i = 0
            let keywords = []
            let spliced = false
            while (!spliced) {
                // If end of string
                if (searchString.indexOf(" ", i) == -1) {
                    keywords.push(searchString.substring(i, searchString.length))
                    spliced = true
                } else {
                    // Add spliced keyword to keyword array
                    keywords.push(searchString.substring(i, searchString.indexOf(" ", i)))
                    i = searchString.indexOf(" ", i) + 1
                }
            }
            // Use keywords to build search options
            let searchOptions = []
            // Add regex of keywords to all search options
            for (const key of keywords) {
                searchOptions.push({ "asset_tag": { $regex: key, $options: "is" } })
                searchOptions.push({ "manufacturer": { $regex: key, $options: "is" } })
                searchOptions.push({ "asset_type": { $regex: key, $options: "is" } })
                searchOptions.push({ "chassis_type": { $regex: key, $options: "is" } })
                searchOptions.push({ "location": { $regex: key, $options: "is" } })
                searchOptions.push({ "model": { $regex: key, $options: "is" } })
                searchOptions.push({ "serial": { $regex: key, $options: "is" } })
                searchOptions.push({ "power_port": { $regex: key, $options: "is" } })
                searchOptions.push({ "public_port": { $regex: key, $options: "is" } })
                searchOptions.push({ "private_port": { $regex: key, $options: "is" } })
                searchOptions.push({ "ipmi_port": { $regex: key, $options: "is" } })
            }
            Asset.aggregate([{ $match: { $or: searchOptions } }])
            .skip(pageSize * (pageNum - 1))
            .limit(Number(pageSize))
            .exec((err, record) => {
                if (err)
                    res.status(500).send("API could not handle your request: " + err);
                else
                    res.status(200).json(record);
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    updateAsset: async (req: Request, res: Response) => {
        // Not my proudest code
        try {
            let { asset, parts } = req.body;
            if (!/WNX([0-9]{7})+/.test(asset.asset_tag)||!(asset.asset_tag&&asset.asset_type)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            // Remove date created if present
            asset.date_created;
            // Set by attribute to requesting user
            asset.by = req.user.user_id;
            // Get current date
            asset.date_updated = Date.now();
            if(!parts) {
                parts = []
            }
            // Find part records currently associated with asset
            let partRecords = await PartRecord.find({
                asset_tag: asset.asset_tag, 
                next: null
            })
            // 
            let existingPartIDs = []
            let existingQuantities = []
            // Get NXID and quantites into seperate arrays so indexOf() can be used
            for(const part of partRecords) {
                // Get index of part ID
                let index = existingPartIDs.indexOf(part.nxid)
                if(index==-1) {
                    // If part isn't in array, add it with a quantity of one
                    existingPartIDs.push(part.nxid)
                    existingQuantities.push(1)
                } else {
                    // If part already exists, increment quantity
                    existingQuantities[index] += 1
                }
            }
            // Array of part differences - {nxid: WNX0001778, quantity: -2}, {nxid: WNX0002753, quantity: (+)4}
            let differencesPartIDs = []
            let differencesQuantities = []
            // Iterate through submitted parts
            for(const part of parts) {
                let index = existingPartIDs.indexOf(part.nxid)
                if(index == -1) {
                    // If part didn't exist before, add it to differences as is
                    differencesPartIDs.push(part.nxid)
                    differencesQuantities.push(part.quantity)
                }
                else {
                    // Find the difference of quantites
                    // If new quantity was 4 and old quantity was 3, only 1 part record will need to be added
                    let quantityDifference = part.quantity - existingQuantities[index]
                    differencesPartIDs.push(part.nxid)
                    differencesQuantities.push(quantityDifference)
                }
            }
            // Check for parts that were absent from submission 
            for(let i = 0; i < existingPartIDs.length; i++) {
                // Check for every existing part on the difference list
                let index = differencesPartIDs.indexOf(existingPartIDs[i])
                // If part is missing - add it to list as a fully removed part
                if(index == -1) {
                    differencesPartIDs.push(existingPartIDs[i])
                    differencesQuantities.push(-1*existingQuantities[i])
                }
            }
            // Store results so only one query is needed    
            // Go through all parts being added to asset and make sure the user has required parts before editing anything
            for (let i = 0; i < differencesPartIDs.length; i++) {
                if (differencesQuantities[i]>0) {
                    // Subtract from user's inventory and add to asset
                    let userInventoryCount = await PartRecord.count({owner: req.user.user_id, next: null, nxid: differencesPartIDs[i]})
                    if (userInventoryCount < differencesQuantities[i]) {
                        return res.status(400).send("Not enough parts in your inventory");
                    }
                    // Save results to avoid duplicate queries
                }
            }
            // Update the asset object and return to user before updating parts records
            Asset.findByIdAndDelete(asset._id, (err: CallbackError, record: AssetSchema) => {
                if (err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                else {
                    Asset.create(asset, (err: CallbackError, new_asset: AssetSchema)=>{
                        if(err) {
                            handleError(err)
                            return res.status(500).send("API could not handle your request: " + err);
                        }
                        res.status(200).json(new_asset)
                    })
                }
            });
            // Edit parts records after confirming quantities and updating Asset object
            for (let i = 0; i < differencesPartIDs.length; i++) {
                // Early return for unchanged quantities
                if (differencesQuantities[i]===0) {
                    continue
                }
                let searchOptions = {}
                let createOptions = {} as PartRecordSchema
                if (differencesQuantities[i]>0) {
                    // If parts are being added to asset: 
                    searchOptions = {
                        owner: req.user.user_id,
                        next: null,
                        nxid: differencesPartIDs[i]
                    }
                    createOptions = {
                        asset_tag: asset.asset_tag,
                        building: asset.building,
                        location: "Asset",
                        by: req.user.user_id,
                        next: null,
                    } as PartRecordSchema
                } else {
                    // If parts are being removed from asset: 
                    searchOptions = {
                        nxid: differencesPartIDs[i],
                        asset_tag: asset.asset_tag,
                        next: null
                    }
                    differencesQuantities[i] = (-1*differencesQuantities[i])
                    createOptions = {
                        owner: req.user.user_id,
                        building: req.user.building,
                        location: "Tech Inventory",
                        by: req.user.user_id,
                        next: null,
                    } as PartRecordSchema
                }
                // Get parts records that will be updated
                let oldRecords = await PartRecord.find(searchOptions)
                createOptions.nxid = differencesPartIDs[i]
                // Create a new record for each part and update previous iteration
                for (let j = 0; j < differencesQuantities[i]; j++) {
                    createOptions.prev = oldRecords[j]._id
                    PartRecord.create(createOptions, callbackHandler.updateRecord)
                }
            }
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    getPartsOnAsset: async (req: Request, res: Response) => {
        try {
            const { asset_tag } = req.query
            // Find all parts records associated with asset tag
            PartRecord.find({asset_tag, next: null}, async (err: CallbackError, partsRecords: PartRecordSchema[]) => {
                if(err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: "+err);
                }
                // Temporary arrays
                let partIDs = []
                let quantities = []
                // Go through every part records and change duplicates to new quantities
                for (let i = 0; i < partsRecords.length; i++) {
                    let index = partIDs.indexOf(partsRecords[i].nxid)
                    // If part isn't already in array
                    if (index == -1) {
                        // Push part to arrays with a quantity of 1
                        partIDs.push(partsRecords[i].nxid)
                        quantities.push(1)
                    } else {
                        // Part is already in array - update quantity
                        quantities[index] += 1
                    }
                }
                // Array that will be returned
                let partsAsLoadedCartItem = []
                // Go through part
                for (let i = 0; i < partIDs.length; i++) {
                    // Get part info
                    let partInfo = await Part.findOne({nxid: partIDs[i]})
                    partsAsLoadedCartItem.push({part: partInfo, quantity: quantities[i]})
                    
                }
                // Done
                res.status(200).json(partsAsLoadedCartItem)
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    deleteAsset: async (req: Request, res: Response) => {
        try {
            if(req.user.role != "admin")
                return res.status(403).send("Only admin can delete assets.")
            const { asset_tag } = req.query
            // Find all parts records associated with asset tag
            let records = await PartRecord.find({ asset_tag, next: null,})   
            for (let record of records) {
                let createOptions = {
                    nxid: record.nxid,
                    owner: "all",
                    building: req.user.building,
                    location: "All Techs",
                    by: req.user.user_id,
                    prev: record._id,
                    next: null,
                } as PartRecordSchema
                // let newRecord = await PartRecord.create(createOptions);
                // await partRecord.findByIdAndUpdate(createOptions.prev, {next: newRecord._id})
                
                await partRecord.findByIdAndUpdate(createOptions.prev, {next: "deleted"})
            }
            Asset.findOneAndDelete({asset_tag}, (err: CallbackError, asset: AssetSchema) => {
                if(err) {
                    res.status(500).send("API could not handle your request: "+err);
                    return;
                }
                res.status(200).send("Success")
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    }
};

export default assetManager

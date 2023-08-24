/**
* @author Cameron McKay
* 
* @email cameron@webnx.com
* 
* @brief Asset manager object for querying database and creating responses
* 
*/
import Asset from "../model/asset.js";
import PartRecord from "../model/partRecord.js";
import handleError from "../config/handleError.js";
import { Request, Response } from "express";
import { AssetSchema, CartItem, PartRecordSchema } from "./interfaces.js";
import mongoose, { CallbackError, isValidObjectId } from "mongoose";
import partRecord from "../model/partRecord.js";
import { 
    isValidAssetTag,
    cleanseAsset,
    findExistingSerial,
    createPartRecordsOnAsset,
    returnAsset,
    returnAssetHistory,
    returnAssetSearch,
    getAddedAndRemoved,
    updateParts,
    assetsAreSimilar,
    userHasInInventory,
    partRecordsToCartItemsWithInfo
} from "./methods/assetMethods.js";
import callbackHandler from "../middleware/callbackHandlers.js";
import { getNumPages, getPageNumAndSize, getTextSearchParams } from "./methods/genericMethods.js";
import { cartItemsValid, combineAndRemoveDuplicateCartItems, sanitizeCartItems } from "./methods/partMethods.js";

const assetManager = {
    addUntrackedAsset: async (req: Request, res: Response) => {
        try {
            // Get asset from request
            let asset = req.body.asset as AssetSchema
            let parts = req.body.parts as CartItem[]
            // Return if user is kiosk
            if(req.user.roles.includes("kiosk")) {

                return res.status(401).send("Kiosk cannot create assets")
            }
            // Check for required fields
            if (!(asset.asset_tag&&asset.asset_type)||!isValidAssetTag(asset.asset_tag)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            let existingAsset = await Asset.findOne({asset_tag: asset.asset_tag})
            if(existingAsset) {
                return res.status(400).send("Asset tag already in use");
            }
            // Remove date created if present
            delete asset.date_created;
            // Set by attribute to requesting user
            let dateCreated = Date.now()
            asset.by = req.user.user_id;
            asset.date_created = new Date(dateCreated);
            asset.date_updated = dateCreated;
            asset.prev = null;
            asset.next = null;
            delete asset.migrated;

            asset = cleanseAsset(asset)

            if(asset.parent&&asset.parent!='') {
                let parentChassis = await Asset.findOne({asset_tag: asset.parent, next: null})
                if(parentChassis==null)
                    return res.status(400).send(`Node chassis not found`);
            }

            // Set sentinel value
            let existingSerial = await findExistingSerial(parts)
            // If serial already exists, return error
            if(existingSerial!="")
                return res.status(400).send(`Serial number ${existingSerial} already in inventory`);
            
            // Create part records
            await createPartRecordsOnAsset(parts, asset.asset_tag!, req.user.user_id, asset.building!, dateCreated)
            // Create a new asset
            Asset.create(asset, returnAsset(res));
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    getAssets: async (req: Request, res: Response) => {
        try {
            // Parse search info
            let { pageSize, pageSkip } = getPageNumAndSize(req)
            // Get asset object from request
            let asset = cleanseAsset(req.query as AssetSchema);
            asset.next = null;
            let numAssets = await Asset.count(asset)
            let numPages = getNumPages(pageSize, numAssets)
            // Send request to database
            Asset.find(asset)
                .skip(pageSkip)
                .limit(pageSize)
                .exec(returnAssetSearch(res, numPages, numAssets))
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    getAssetByID: async (req: Request, res: Response) => {
        try {
            // Get id from query
            let id = (req.query.id as string).toUpperCase()
            // Test regex for NXID
            if (isValidAssetTag(id)||id=='test') {
                // Find by NXID
                Asset.findOne({asset_tag: id, next: null}, returnAsset(res));
            }
            // If id is not NXID
            else {
                // Find by mongo ID
                Asset.findById(id, returnAsset(res));
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
            let { searchString, pageSize, pageSkip } = getTextSearchParams(req);
            // Find parts
            let fullText = false
            // Check if text search yields results            
            let ass = await Asset.findOne(searchString != ''? { $text: { $search: searchString } } : {})
            // Set fulltext if text search yields results
            if(ass!=undefined)
                fullText = true
            // Fulltext search
            if (fullText) {
                let numAssets = await Asset.count(searchString != ''? { $text: { $search: searchString } } : {}).where({next: null})
                // Ternary that hurts my eyes
                let numPages = getNumPages(pageSize, numAssets)

                Asset.find(searchString != ''? { $text: { $search: searchString } } : {})
                    .where({next: null})
                    .skip(pageSkip)
                    .limit(pageSize)
                    .exec(returnAssetSearch(res, numPages, numAssets))
            }
            else {
                // Keyword search
                let keywords = []
                keywords.push(searchString)
                keywords = keywords.concat(searchString.split(" "))
                // Use keywords to build search options
                let searchOptions = [] as any[]
                // Add regex of keywords to all search options
                keywords.map((key) => {
                    searchOptions.push({ "asset_tag": { $regex: key, $options: "is" } })
                    searchOptions.push({ "notes": { $regex: key, $options: "is" } })
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
                })

                // Aggregate count
                let countQuery = await Asset.aggregate([{ $match: {
                    $and: [
                        { $or: searchOptions },
                        { next: null }
                    ]
                    
                        } 
                }]).count("numAssets")
                // This is stupid but it works
                let numAssets = countQuery.length > 0&&countQuery[0].numAssets ? countQuery[0].numAssets : 0
                // Ternary that hurts my eyes
                let numPages = getNumPages(pageSize, numAssets)
                Asset.aggregate([{ $match: {
                    $and: [
                        { $or: searchOptions },
                        { next: null }
                    ]
                    
                        } 
                    }])
                    .skip(pageSkip)
                    .limit(pageSize)
                    .exec(returnAssetSearch(res, numPages, numAssets))
            }
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    updateAsset: async (req: Request, res: Response) => {
        try {
            // Get data from request body
            let { asset, parts, correction } = req.body;
            // Check if asset is valid
            if (!isValidAssetTag(asset.asset_tag)||!(asset.asset_tag&&asset.asset_type)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            // Save current time for updates
            let current_date = Date.now();
            asset = asset as AssetSchema
            // Prep asset for updates
            asset.by = req.user.user_id;
            asset.date_updated = current_date;
            asset = cleanseAsset(asset)
            // Check if node parent chassis exists
            if(asset.parent&&asset.parent!='') {
                let parentChassis = await Asset.findOne({asset_tag: asset.parent, next: null})
                if(parentChassis==null)
                    return res.status(400).send(`Node chassis not found`);
            }
            // Create sentinel value
            let isMigrated = false
            // Find an existing asset
            let existingAsset = await Asset.findOne({asset_tag: asset.asset_tag, next: null})
            // Check if existing asset is null
            if(existingAsset==null) {
                // Return error
                return res.status(400).send("Could not find asset to update");
            }
            // If asset is marked as migrated
            if(asset.migrated) {
                // Set sentinel value
                isMigrated = true
                // Check if existing asset was already migrated
                if(!existingAsset.migrated)
                    // Return error
                    return res.status(400).send("Asset has already been migrated");
            }
            // Delete migrated data
            delete asset.migrated
            delete asset.old_by
            // Get part records that are currently on asset
            let existingParts = await PartRecord.find({
                asset_tag: asset.asset_tag, 
                next: null
            })
            parts = sanitizeCartItems(parts)
            if(!(await cartItemsValid(parts)))
                return res.status(400).send("Error in updated parts list");

            let { added, removed, error } = getAddedAndRemoved(parts, existingParts)
            if(error==true)
                return res.status(400).send("Error in updated parts list");
            // Make sure user has parts in their inventory
            if(correction!=true) {
                let hasInventory = await userHasInInventory(req.user.user_id, added)
                if(!hasInventory)
                    return res.status(400).send("Added parts on request not found in user inventory");
            }
            // Put removed parts in user inventory
            let removedOptions = {
                owner: req.user.user_id,
                building: req.user.building,
                location: "Tech Inventory",
                by: req.user.user_id,
                date_created: current_date,
                next: null,
            } as PartRecordSchema
            // Put added parts on asset
            let addedOptions = {
                asset_tag: asset.asset_tag,
                building: asset.building,
                location: "Asset",
                date_created: current_date,
                by: req.user.user_id,
                next: null,
            } as PartRecordSchema
            // Filter by asset tag
            let assetSearchOptions = {
                asset_tag: asset.asset_tag,
                next: null
            }
            // Filter by user id
            let userSearchOptions = {
                owner: req.user.user_id,
                next: null
            }
            // Mark removed parts as deleted
            if(correction==true) {
                delete removedOptions.owner
                removedOptions.location = 'deleted'
                removedOptions.next = 'deleted'
            }
            // Update removed parts
            await updateParts(removedOptions, assetSearchOptions, removed, isMigrated)
            // Create new part records for added parts
            if(correction==true)
                isMigrated = true
            // Update added parts
            await updateParts(addedOptions, userSearchOptions, added, isMigrated)
    
            // Update the asset object and return to user before updating parts records
            let getAsset = JSON.parse(JSON.stringify(await Asset.findOne({asset_tag: asset.asset_tag, next: null}))) as AssetSchema
            
            // Check if assets are similar
            if(!assetsAreSimilar(asset, getAsset)) {
                // Assets are not similar
                delete asset._id
                asset.prev = getAsset._id
                asset.date_created = current_date
                asset.by = req.user.user_id
                delete asset.date_updated
                // Create new asset
                Asset.create(asset, callbackHandler.updateAssetAndReturn)
            }
            // Assets are similar
            else {
                // Check if parts were added or removed
                if(added.length>0||removed.length>0) {
                    // If parts were added or removed, set date_updated to current date
                    await Asset.findByIdAndUpdate(asset._id, { date_updated: current_date })
                    asset.date_updated = current_date
                }
                // Return asset
                res.status(200).json(asset)
            }
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    // @TODO: simplify this to an aggregate function
    getPartsOnAsset: async (req: Request, res: Response) => {
        try {
            // Parse asset_tag
            const asset_tag = req.query.asset_tag as string
            // Check if valid
            if (!asset_tag||!isValidAssetTag(asset_tag))
                return res.status(400).send("Invalid request");
            // Find all parts records associated with asset tag
            PartRecord.find({asset_tag, next: null}, async (err: CallbackError, records: PartRecordSchema[]) => {
                // If mongoose returns error
                if (err) {
                    // Handle error
                    handleError(err)
                    // Return to client
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let returnValue = await partRecordsToCartItemsWithInfo(records)
                // Return to client
                res.status(200).json(returnValue)
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    deleteAsset: async (req: Request, res: Response) => {
        try {
            if(!req.user.roles.includes("admin"))
                return res.status(403).send("Only admin can delete assets.")
            const asset_tag = req.query.asset_tag as string
            if (!asset_tag||!isValidAssetTag(asset_tag))
                return res.status(400).send("Invalid request");
            // Find all parts records associated with asset tag
            let records = await PartRecord.find({ asset_tag, next: null,})   
            let current_date = Date.now()
            // Find all records associated with asset
            await Promise.all(records.map(async (record) => {
                // Mark as deleted
                await partRecord.findByIdAndUpdate(record._id, {next: "deleted"})
            }))
            // Find asset
            Asset.findOne({asset_tag, next: null}, (err: CallbackError, asset: AssetSchema) => {
                if(err) {
                    res.status(500).send("API could not handle your request: "+err);
                    return;
                }
                asset.prev = asset._id
                asset.next = "deleted"
                asset.date_created = new Date(current_date)
                delete asset._id
                // Create new iteration of asset
                Asset.create(asset, callbackHandler.updateAssetAndReturn(res))
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    getAssetHistory: async (req: Request, res: Response) => {
        try {
            // Get ID from query string
            let id = req.query.id as string
            // Get page num and page size
            let { pageNum, pageSize } = getPageNumAndSize(req)
            // Check if ID is null or doesn't match ID type
            if (!id||(!isValidAssetTag(id)&&!isValidObjectId(id)))
                return res.status(400).send("Invalid request");
            // If NXID
            if (isValidAssetTag(id)) {
                Asset.findOne({asset_tag: id, next: null}, returnAssetHistory(pageNum, pageSize, res))
            }
            // If mongo ID
            else {
                Asset.findById(id, returnAssetHistory(pageNum, pageSize, res))
            }
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
};

export default assetManager

import Asset from "../model/asset.js";
import AssetTemplate from "../model/assetTemplate.js";
import PartRecord from "../model/partRecord.js";
import handleError from "../util/handleError.js";
import { Request, Response } from "express";
import { AssetSchema, PartRecordSchema } from "../interfaces.js";
import { CallbackError, isValidObjectId, MongooseError } from "mongoose";
import { 
    isValidAssetTag,
    cleanseAsset,
    findExistingSerial,
    returnAsset,
    returnAssetHistory,
    returnAssetSearch,
    getAddedAndRemoved,
    updatePartsAsync,
    assetsAreSimilar,
    userHasInInventoryAsync,
    partRecordsToCartItems
} from "../methods/assetMethods.js";
import callbackHandler from "../util/callbackHandlers.js";
import { getNumPages, getPageNumAndSize, getTextSearchParams } from "../methods/genericMethods.js";
import { cartItemsValidAsync, combineAndRemoveDuplicateCartItems, sanitizeCartItems } from "../methods/partMethods.js";

const assetManager = {
    addUntrackedAsset: async (req: Request, res: Response) => {
        try {
            // Get asset from request
            let asset = cleanseAsset(req.body.asset)
            let parts = sanitizeCartItems(req.body.parts)
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
            // If asset has a parent, check if it exists
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
            // Create a new asset
            Asset.create(asset, async (err: MongooseError, newAsset: AssetSchema) => {
                if(err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let date = newAsset.date_created
                // Create all part records
                let createOptions = {
                    building: newAsset.building,
                    location: "Asset",
                    asset_tag: newAsset.asset_tag,
                    by: req.user.user_id,
                    date_created: date,
                    prev: null,
                    next: null
                }
                await updatePartsAsync(createOptions, {}, parts, true)
                // Create/update all assets on pallet
                res.status(200).send("Success");
            });
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    createAssetTemplate: async (req: Request, res: Response) => {
        try {
            // Get asset from request
            let asset = cleanseAsset(req.body.asset)
            let parts = sanitizeCartItems(req.body.parts)
            let name = req.body.name && (typeof req.body.name === 'string' || req.body.name instanceof String) ? req.body.name : "Untitled Template"
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
            parts = combineAndRemoveDuplicateCartItems(parts.map((p)=>{
                return { nxid: p.nxid, quantity: p.quantity ? p.quantity : 1 }
            }))
            let valid = cartItemsValidAsync(parts)
            if(!valid)
                return res.status(400).send("Invalid parts on request.");
            asset.parts = parts
            asset.template_name = name
            // Create a new asset
            AssetTemplate.create(asset, async (err: MongooseError, newAsset: AssetSchema) => {
                // Create/update all assets on pallet
                res.status(200).send("Success");
            })
            .catch((err)=>{
                handleError(err)
                return res.status(500).send("API could not handle your request: " + err);
            })
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
            if(ass!=null)
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
            let { asset, parts, correction, oldAssetTag } = req.body;
            // Check if asset is valid
            if (!isValidAssetTag(asset.asset_tag)||!(asset.asset_tag&&asset.asset_type)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            // Save current time for updates
            let current_date = Date.now();
            let asset_tag_changed = false
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
            // If asset tag is being changed
            if(correction==true&&oldAssetTag!=undefined&&isValidAssetTag(oldAssetTag)) {
                if(existingAsset)
                    return res.status(400).send("Asset with that tag already exists.");
                // Try finding asset with old tag
                existingAsset = await Asset.findOne({asset_tag: oldAssetTag, next: null})
                // If found, set asset tag changed flag
                if(existingAsset)
                    asset_tag_changed = true
                // Not found - return error
                else
                    return res.status(400).send("Could not find asset to update");
            }
            // Check if existing asset is null
            if(existingAsset==null) {
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
                asset_tag: existingAsset.asset_tag, 
                next: null
            })
            parts = sanitizeCartItems(parts)
            if(!(await cartItemsValidAsync(parts)))
                return res.status(400).send("Error in updated parts list");

            let { added, removed, error } = getAddedAndRemoved(parts, existingParts)
            if(error==true)
                return res.status(400).send("Error in updated parts list");
            // Make sure user has parts in their inventory
            if(correction!=true&&isMigrated!=true) {
                let hasInventory = await userHasInInventoryAsync(req.user.user_id, added)
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
            await updatePartsAsync(removedOptions, assetSearchOptions, removed, isMigrated)
            // Create new part records for added parts
            if(correction==true)
                isMigrated = true
            // Update added parts
            await updatePartsAsync(addedOptions, userSearchOptions, added, isMigrated)
            // If asset tag is being changed
            if(asset_tag_changed==true) {
                // Update all records attached to this asset to match new tag
                await PartRecord.updateMany({asset_tag: existingAsset.asset_tag}, {asset_tag: asset.asset_tag})
                await Asset.updateMany({asset_tag: existingAsset.asset_tag}, {asset_tag: asset.asset_tag})
            }
            // Update the asset object and return to user before updating parts records
            let getAsset = JSON.parse(JSON.stringify(await Asset.findOne({asset_tag: asset.asset_tag, next: null}))) as AssetSchema
            // Check if assets are similar
            if(!assetsAreSimilar(asset, getAsset)) {
                // Assets are not similar
                delete asset._id
                asset.prev = getAsset._id
                asset.date_created = current_date
                asset.by = req.user.user_id
                asset.prev_pallet = getAsset.pallet
                delete asset.date_updated
                // Create new asset
                Asset.create(asset, callbackHandler.updateAssetAndReturn(res))
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
                let returnValue = partRecordsToCartItems(records)
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
            const asset_tag = req.query.asset_tag as string
            if (!asset_tag||!isValidAssetTag(asset_tag))
                return res.status(400).send("Invalid request");
            Asset.findOne({asset_tag, next: null}, async (err: CallbackError, ass: AssetSchema) => {
                if(err) {
                    res.status(500).send("API could not handle your request: "+err);
                    return;
                }
                // Find all parts records associated with asset tag
                let records = await PartRecord.find({ asset_tag, next: null,})   
                let current_date = Date.now()
                let cartItems = partRecordsToCartItems(records)
                let newInfo = {
                    next: 'deleted',
                    building: ass.building,
                    asset_tag: ass.asset_tag,
                    location: "Asset",
                    date_created: current_date,
                    by: req.user.user_id
                }
                // Find all records associated with asset
                await updatePartsAsync(newInfo, { asset_tag, next: null,}, cartItems, false)
                // Find asset
                let asset = JSON.parse(JSON.stringify(ass))
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
    },
    getHighestAssetTag: async (req: Request, res: Response) => {
        try {
            Asset.aggregate(
                [
                  {
                    $project: {
                      _id: 0,
                      as_num: {
                        $toInt: {
                          $substr: ["$asset_tag", 3, 10],
                        },
                      },
                    },
                  },
                  {
                    $group:
                      /**
                       * _id: The id of the group.
                       * fieldN: The first field name.
                       */
                      {
                        _id: "$as_num",
                      },
                  },
                  {
                    $sort:
                      /**
                       * Provide any number of field/order pairs.
                       */
                      {
                        _id: -1,
                      },
                  },
                ]
                , (err: MongooseError, assets1: AssetSchema) =>{
                    Asset.find({}, (err: MongooseError, assets: AssetSchema) => {
                        if(err)
                            return res.status(500).send("API could not handle your request: " + err);
                        // Parse and sort numbers
                        let numbers = assets.map((n: AssetSchema)=>parseInt(n.asset_tag!.slice(3))).sort((a: number,b: number)=>a-b)
                        let highest = numbers[numbers.length-1]
                        let highest2 = assets1[0]._id
                        // Pad and convert to string
                        let asset_tag = "WNX"+highest.toString().padStart(7, '0')

                        let asset_tag2 = "WNX"+highest2.toString().padStart(7, '0')
                        // Send response
                        return res.status(200).send({find: asset_tag, aggregate: asset_tag2});
                    })
                })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    getNodesOnAsset: async (req: Request, res: Response) => {
        try {
            let asset_tag = req.query.asset_tag as string;
            if(!asset_tag)
                return res.status(400).send("Invalid request");
            if(isValidAssetTag(asset_tag)) {
                Asset.find({parent: asset_tag, next: null}, (err: MongooseError, assets: AssetSchema) => {
                    if(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    res.status(200).json(assets)
                })
            }
            else
               res.status(200).json([])
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
};

export default assetManager

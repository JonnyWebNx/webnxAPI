import { PalletSchema, AssetSchema, PartRecordSchema } from "../interfaces.js"
import { Request, Response } from "express";
import handleError from "../util/handleError.js";
import Pallet from "../model/pallet.js";
import { isValidObjectId } from "mongoose";
import PartRecord from "../model/partRecord.js";
import Asset from "../model/asset.js";
import { getAddedAndRemoved, partRecordsToCartItems, updatePartsAsync, updatePartsClearSerialsAsync, userHasInInventoryAsync } from "../methods/assetMethods.js";
import { CallbackError } from "mongoose";
import { cartItemsValidAsync, sanitizeCartItems } from "../methods/partMethods.js";
import callbackHandler from "../util/callbackHandlers.js";
import { getNumPages, getPageNumAndSize, getTextSearchParams, objectToRegex } from "../methods/genericMethods.js";
import { addAssetsToPallet, cleansePallet, getPalletSearchRegex, isLocationValid, isValidPalletTag, palletsAreSimilar, parseAssetTags, returnPallet, returnPalletHistory, returnPalletSearch } from "../methods/palletMethods.js";


const palletManager = {

    createPallet: async (req: Request, res: Response) => {
        try {
            // Cleanse pallet
            let pallet = cleansePallet(req.body.pallet as PalletSchema)
            // Get parts on pallet
            let parts = sanitizeCartItems(req.body.parts)
            // Get assets on pallet
            let asset_tags = parseAssetTags(req.body.assets)
            // Check if input is valid
            if(!pallet||!isValidPalletTag(pallet.pallet_tag)||!isLocationValid(pallet.location))
                return res.status(400).send("Invalid request");
            // Try and find existing pallet
            let existingPallet = await Pallet.findOne({pallet_tag: pallet.pallet_tag})
            // Return error if pallet already exists
            if(existingPallet!=null)
                return res.status(400).send("Pallet already exists.");
            // Get user info
            pallet.by = req.user.user_id as string
            // Get current date
            pallet.date_created = new Date()
            // Create pallet
            Pallet.create(cleansePallet(pallet), async (err: CallbackError, newPallet: PalletSchema)=>{
                if(err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let date = newPallet.date_created
                // Create all part records
                let createOptions = {
                    building: newPallet.building,
                    location: "Pallet",
                    pallet_tag: newPallet.pallet_tag,
                    by: req.user.user_id,
                    date_created: date,
                    prev: null,
                    next: null
                }
                await updatePartsAsync(createOptions, {}, parts, true)
                // Create/update all assets on pallet
                await addAssetsToPallet(newPallet.pallet_tag, asset_tags, req.user.user_id as string, date, newPallet.building)
                res.status(200).send("Success");
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPallets: async (req: Request, res: Response) => {
        try {
            // Parse search info
            let { pageSize, pageSkip } = getPageNumAndSize(req)
            // Get asset object from request
            let pallet = objectToRegex(cleansePallet(req.query as unknown as PalletSchema));
            pallet.next = null;
            let numPallets = await Pallet.count(pallet)
            let numPages = getNumPages(pageSize, numPallets)
            // Send request to database
            Pallet.find(pallet)
                .skip(pageSkip)
                .limit(pageSize)
                .exec(returnPalletSearch(res, numPages, numPallets))
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    getPalletByID: async (req: Request, res: Response) => {
        try {
            let id = req.query.id as string
            // Check if it is a pallet tag
            if(isValidPalletTag(id))
                Pallet.findOne({pallet_tag: id, next: null}, returnPallet(res))
            // Try to find by ID
            else
                Pallet.findById(id, returnPallet(res))
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    searchPallets: async (req: Request, res: Response) => {
        try {
            // Search data
            // Limit
            // Page skip
            let { searchString, pageSize, pageSkip } = getTextSearchParams(req);
            // Find parts
            if(searchString == "") {
                // Count all parts
                let numPallets = await Pallet.count({next: null})
                // Calc number of pages
                let numPages = getNumPages(pageSize, numPallets)
                // Get all parts
                Pallet.find({next: null})
                    // Skip - gets requested page number
                    .skip(pageSkip)
                    // Limit - returns only enough elements to fill page
                    .limit(pageSize)
                    // Return search to user
                    .exec(returnPalletSearch(res, numPages, numPallets))
                return
            }
            // Get keyword regex
            let { regexKeywords, relevanceScore } = getPalletSearchRegex(searchString)
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
            let countQuery = await Pallet.aggregate(aggregateQuery).count("numPallets")
            // This is stupid but it works
            let numPallets = countQuery.length > 0&&countQuery[0].numPallets ? countQuery[0].numPallets : 0
            // Get num pages
            let numPages = getNumPages(pageSize, numPallets)
            // Find pallets
            Pallet.aggregate(aggregateQuery)
                .skip(pageSkip)
                .limit(pageSize)
                .exec(returnPalletSearch(res, numPages, numPallets))
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    updatePallet: async (req: Request, res: Response) => {
        try {
            // Get data from request body
            let { pallet, parts, correction } = req.body;
            // Get assets on pallet
            let asset_tags = parseAssetTags(req.body.assets)
            // Check if asset is valid
            if (!isValidPalletTag(pallet.pallet_tag)||!(pallet.pallet_tag)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            // Save current time for updates
            let current_date = Date.now();
            pallet = pallet as PalletSchema
            // Prep pallet for updates
            pallet.by = req.user.user_id;
            pallet.date_updated = current_date;
            pallet = cleansePallet(pallet)
            // Find an existing pallet
            let existingPallet = await Pallet.findOne({pallet_tag: pallet.pallet_tag, next: null})
            // Check if existing pallet is null
            if(existingPallet==null) {
                // Return error
                return res.status(400).send("Could not find pallet to update");
            }
            // Get part records that are currently on asset
            let existingParts = await PartRecord.find({ pallet_tag: pallet.pallet_tag, next: null})

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
            // Put added parts on pallet
            let addedOptions = {
                pallet_tag: pallet.pallet_tag,
                building: pallet.building,
                location: "Pallet",
                date_created: current_date,
                by: req.user.user_id,
                next: null,
            } as PartRecordSchema
            // Filter by pallet tag
            let palletSearchOptions = {
                pallet_tag: pallet.pallet_tag,
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
            await updatePartsAsync(removedOptions, palletSearchOptions, removed, false)
            // Update added parts
            await updatePartsClearSerialsAsync(addedOptions, userSearchOptions, added, correction==true)
            // Add assets to pallet
            await addAssetsToPallet(pallet.pallet_tag, asset_tags, req.user.user_id as string, new Date(current_date), pallet.building)
            // Update the asset object and return to user before updating parts records
            let getPallet = JSON.parse(JSON.stringify(await Pallet.findOne({pallet_tag: pallet.pallet_tag, next: null}))) as PalletSchema
            // Check if pallets are similar
            if(!palletsAreSimilar(pallet, getPallet)) {
                // Pallets are not similar
                delete pallet._id
                pallet.prev = getPallet._id
                pallet.date_created = current_date
                pallet.by = req.user.user_id
                delete pallet.date_updated
                // Create new pallet
                Pallet.create(pallet, (err: CallbackError, new_pallet: PalletSchema) => {
                    if (err) {
                        handleError(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    // Update old pallet
                    Pallet.findByIdAndUpdate(new_pallet.prev, { next: new_pallet._id, date_replaced: current_date }, returnPallet(res))
                })
            }
            else {
                // Pallets are similar
                // Check if parts were added or removed
                if(added.length>0||removed.length>0) {
                    // If parts were added or removed, set date_updated to current date
                    await Pallet.findByIdAndUpdate(pallet._id, { date_updated: current_date })
                    pallet.date_updated = current_date
                }
                // Return pallet
                res.status(200).json(pallet)
            }
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    getPartsAndAssetsOnPallet: async (req: Request, res: Response) => {
        try {
            // Parse asset_tag
            const pallet_tag = req.query.pallet_tag as string
            // Check if valid
            if (!pallet_tag||!isValidPalletTag(pallet_tag))
                return res.status(400).send("Invalid request");
            // Find all parts records associated with asset tag
            PartRecord.find({pallet_tag, next: null}, async (err: CallbackError, pRecords: PartRecordSchema[]) => {
                // If mongoose returns error
                if (err) {
                    // Handle error
                    handleError(err)
                    // Return to client
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let parts = partRecordsToCartItems(pRecords)
                // Return to client
                Asset.find({pallet: pallet_tag, next: null}, (err: CallbackError, assets: AssetSchema[]) => {
                    // If mongoose returns error
                    if (err) {
                        // Handle error
                        handleError(err)
                        // Return to client
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    res.status(200).json({parts, assets})
                })
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    deletePallet: async (req: Request, res: Response) => {
        try {
            const pallet_tag = req.query.pallet_tag as string
            if (!pallet_tag||!isValidPalletTag(pallet_tag))
                return res.status(400).send("Invalid request");
            Pallet.findOne({pallet_tag, next: null}, async (err: CallbackError, pall: PalletSchema) => {
                if(err) {
                    res.status(500).send("API could not handle your request: "+err);
                    return;
                }
                // Find all parts records associated with pallet tag
                let records = await PartRecord.find({ pallet_tag, next: null,})   
                let current_date = Date.now()
                let cartItems = partRecordsToCartItems(records)
                let newInfo = {
                    next: 'deleted',
                    building: pall.building,
                    pallet_tag: pall.pallet_tag,
                    location: "Pallet",
                    date_created: current_date,
                    by: req.user.user_id
                }
                // Find all records associated with pallet
                await updatePartsAsync(newInfo, { pallet_tag, next: null,}, cartItems, false)
                // Find pallet
                let pallet = JSON.parse(JSON.stringify(pall))
                pallet.prev = pallet._id
                pallet.next = "deleted"
                pallet.date_created = new Date(current_date)
                delete pallet._id
                // Create new iteration of pallet
                Pallet.create(pallet, callbackHandler.updatePalletAndReturn(res))
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    
    getPalletHistory: async (req: Request, res: Response) => {
        try {
            // Get ID from query string
            let id = req.query.id as string
            // Get page num and page size
            let { pageNum, pageSize } = getPageNumAndSize(req)
            // Check if ID is null or doesn't match ID type
            if (!id||(!isValidPalletTag(id)&&!isValidObjectId(id)))
                return res.status(400).send("Invalid request");
            // If NXID
            if (isValidPalletTag(id)) {
                Pallet.findOne({pallet_tag: id, next: null}, returnPalletHistory(pageNum, pageSize, res))
            }
            // If mongo ID
            else {
                Pallet.findById(id, returnPalletHistory(pageNum, pageSize, res))
            }
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
}

export default palletManager

import Asset from "../model/asset.js";
import PartRecord from "../model/partRecord.js";
import Part from "../model/part.js";
import handleError from "../config/mailer.js";
import callbackHandler from "../middleware/callbackHandlers.js";
import { Request, Response } from "express";
import { AssetEvent, AssetHistory, AssetSchema, CartItem, PartRecordSchema } from "./interfaces.js";
import mongoose, { CallbackError } from "mongoose";
import partRecord from "../model/partRecord.js";

updateAsset: async (req: Request, res: Response) => {
    // Not my proudest code
    try {
        let { asset, parts } = req.body;
        if (!/WNX([0-9]{7})+/.test(asset.asset_tag)||!(asset.asset_tag&&asset.asset_type)) {
            // Send response if request is invalid
            return res.status(400).send("Invalid request");
        }
        let current_date = Date.now()
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
        let existingPartIDs = [] as string[]
        let existingQuantities = [] as number[]
        // Get NXID and quantites into seperate arrays so indexOf() can be used
        partRecords.map((part: PartRecordSchema) => {
            // Get index of part ID
            let index = existingPartIDs.indexOf(part.nxid!)
            if(index==-1) {
                // If part isn't in array, add it with a quantity of one
                existingPartIDs.push(part.nxid!)
                existingQuantities.push(1)
            } else {
                // If part already exists, increment quantity
                existingQuantities[index] += 1
            }
        })
        // Array of part differences - {nxid: WNX0001778, quantity: -2}, {nxid: WNX0002753, quantity: (+)4}
        let differencesPartIDs = [] as string[]
        let differencesQuantities = [] as number[]
        // Iterate through submitted parts
        parts.map((part: CartItem) => {
            let index = existingPartIDs.indexOf(part.nxid!)
            if(index == -1) {
                // If part didn't exist before, add it to differences as is
                differencesPartIDs.push(part.nxid)
                differencesQuantities.push(part.quantity!)
            }
            else {
                // Find the difference of quantites
                // If new quantity was 4 and old quantity was 3, only 1 part record will need to be added
                let quantityDifference = part.quantity! - existingQuantities[index]
                differencesPartIDs.push(part.nxid)
                differencesQuantities.push(quantityDifference)
            }
        })
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
        delete asset.date_updated
        // Edit parts records after confirming quantities and updating Asset object
        await Promise.all(differencesPartIDs.map(async(id, i, arr) => {
            if (differencesQuantities[i]===0) {
                return
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
                    date_created: current_date,
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
                    date_created: current_date,
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
        }))
        // Update the asset object and return to user before updating parts records
        let getAsset = JSON.parse(JSON.stringify(await Asset.findOne({asset_tag: asset.asset_tag, next: null}))) as AssetSchema
        let save_id = asset._id
        delete getAsset.prev
        delete getAsset._id
        delete getAsset.next
        delete getAsset.date_created
        delete getAsset.by
        delete getAsset.__v
        delete asset.prev
        delete asset._id
        delete asset.next
        delete asset.date_created
        delete asset.by
        delete asset.__v
    
        if(JSON.stringify(getAsset) != JSON.stringify(asset)) {
            asset.prev = save_id
            asset.next = null
            asset.date_created = current_date
            asset.by = req.user.user_id
            delete asset._id
            Asset.create(asset, (err: CallbackError, new_asset: AssetSchema) => {
                if (err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                Asset.findByIdAndUpdate(new_asset.prev, { next: new_asset._id, date_replaced: current_date }, (err: CallbackError, updated_asset: AssetSchema) => {
                    if (err) {
                        handleError(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    res.status(200).json(new_asset)
                })
            })
        }
        else {
            res.status(200).json(asset)
        }
    } catch(err) {
        handleError(err)
        return res.status(500).send("API could not handle your request: "+err);
    }
}
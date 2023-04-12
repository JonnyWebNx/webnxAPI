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
    try {
        // Get data from request body
        let { asset, parts } = req.body;
        // Check if asset is valid
        if (!/WNX([0-9]{7})+/.test(asset.asset_tag)||!(asset.asset_tag&&asset.asset_type)) {
            // Send response if request is invalid
            return res.status(400).send("Invalid request");
        }
        // Save current time for updates
        let current_date = Date.now();
        // Prep asset for updates
        asset.by = req.user.user_id;
        asset.date_updated = current_date;
        // Get part records that are currently on asset
        let existingParts = await PartRecord.find({
            asset_tag: asset.asset_tag, 
            next: null
        })
        // Store existing parts in a more usable format
        let unserializedPartsOnAsset = new Map<string, number>();
        let serializedPartsOnAsset = [] as CartItem[];
        // Map part records to new format
        existingParts.map((p)=>{
            // Check if serialized
            if(p.serial) {
                // Push to array
                serializedPartsOnAsset.push({ nxid: p.nxid, serial: p.serial });
            }
            else {
                // Create variable
                let newQuantity = 0;
                // If part already exists
                if(unserializedPartsOnAsset.has(p.nxid)) {
                    // Increment quantity
                    newQuantity = unserializedPartsOnAsset.get(p.nxid)!+1;
                }
                else {
                    // Part is not in map, set quantity to one
                    newQuantity = 1;
                }
                // Update map
                unserializedPartsOnAsset.set(p.nxid, newQuantity);
            }
        })
        // Store existing parts in a more usable format
        let unserializedPartsOnRequest = new Map<string, number>();
        let serializedPartsOnRequest = [] as CartItem[];
        // Map part records to new format
        parts.map((p: CartItem)=>{
            // Check if serialized
            if(p.serial) {
                // Push to array
                serializedPartsOnRequest.push({ nxid: p.nxid, serial: p.serial });
            }
            else {
                // Create variable
                let newQuantity = 0;
                // If part already exists
                if(unserializedPartsOnRequest.has(p.nxid)) {
                    // Increment quantity
                    newQuantity = unserializedPartsOnRequest.get(p.nxid)!+1;
                }
                else {
                    // Part is not in map, set quantity to one
                    newQuantity = 1;
                }
                // Update map
                unserializedPartsOnRequest.set(p.nxid, newQuantity);
            }
        })
        // Parts removed from asset
        let removed = [] as CartItem[]
        // Parts added to asset
        let added = [] as CartItem[]
        // Check for serialized parts removed from asset
        serializedPartsOnAsset.map((p)=>{
            let existing = serializedPartsOnRequest.find((e)=>(p.nxid==e.nxid)&&(p.serial==e.serial));
            if(!existing)
                removed.push(p)
        })
        // Check for removed unserialized parts
        unserializedPartsOnAsset.forEach((v, k)=>{
            if(unserializedPartsOnRequest.has(k)) {
                let reqQuantity = unserializedPartsOnRequest.get(k)!
                let difference = reqQuantity - v;
                if(difference > 0)
                    removed.push({nxid: k, quantity: difference})    
            }
            else {
                removed.push({nxid: k, quantity: v})
            }
        })

        // Check for serialized parts added to  asset
        serializedPartsOnRequest.map((p)=>{
            let existing = serializedPartsOnAsset.find((e)=>(p.nxid==e.nxid)&&(p.serial==e.serial));
            if(!existing)
                added.push(p)
        })
        // Check for added unserialized parts
        unserializedPartsOnRequest.forEach((v, k)=>{
            if(unserializedPartsOnAsset.has(k)) {
                let assetQuantity = unserializedPartsOnAsset.get(k)!
                let difference = assetQuantity - v;
                if(difference > 0)
                    added.push({nxid: k, quantity: difference})    
            }
            else {
                added.push({nxid: k, quantity: v})
            }
        })

        let removedOptions = {
            owner: req.user.user_id,
            building: req.user.building,
            location: "Tech Inventory",
            by: req.user.user_id,
            date_created: current_date,
            next: null,
        } as PartRecordSchema

        let addedOptions = {
            asset_tag: asset.asset_tag,
            building: asset.building,
            location: "Asset",
            date_created: current_date,
            by: req.user.user_id,
            next: null,
        } as PartRecordSchema
        let assetSearchOptions = {
            asset_tag: asset.asset_tag,
            next: null
        }
        let userSearchOptions = {
            owner: req.user.user_id,
            next: null
        }
        
        await Promise.all(removed.map(async (p)=>{
            let createOptions = JSON.parse(JSON.stringify(removedOptions)) as PartRecordSchema
            let searchOptions = JSON.parse(JSON.stringify(assetSearchOptions)) as PartRecordSchema
            searchOptions.nxid = p.nxid
            if(p.serial) {
                createOptions.serial = p.serial
                searchOptions.serial = p.serial
                let prev = await PartRecord.findOne(searchOptions)
                if(!prev)
                    return
                createOptions.prev = prev._id
                PartRecord.create(createOptions, callbackHandler.updateRecord)
            }
            else if(p.quantity) {
                let toBeUpdated = await PartRecord.find(searchOptions)
                if (toBeUpdated.length < p.quantity)
                    return
                for (let i = 0; i < p.quantity; i++) {
                    createOptions.prev = toBeUpdated[i]._id
                    PartRecord.create(createOptions, callbackHandler.updateRecord)
                }
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
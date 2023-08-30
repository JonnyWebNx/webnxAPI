import { PalletSchema, CartItem, AssetSchema, PartRecordSchema } from "./interfaces.js"
import { Request, Response } from "express";
import handleError from "../config/handleError.js";
import Pallet from "../model/pallet.js";
import { objectSanitize, stringSanitize } from "../config/sanitize.js";
import { MongooseError } from "mongoose";
import PartRecord from "../model/partRecord.js";
import Asset from "../model/asset.js";
import { getAddedAndRemoved, isValidAssetTag, updateParts, userHasInInventory } from "./methods/assetMethods.js";
import { CallbackError } from "mongoose";

function isValidPalletTag(id: string) {
    return /PAL([0-9]{7})+/.test(id)
}

function isLocationValid(location: string) {
    return location && location != ""
}

function cleansePallet(pallet: PalletSchema) {
    let newPallet = {
        pallet_tag: pallet.pallet_tag,
        location: pallet.location,
        building: pallet.building,
        notes: pallet.notes,
        by: pallet.by,
        date_created: pallet.date_created,
        next: pallet.next,
        prev: pallet.prev
    }
    return objectSanitize(newPallet, false) as PalletSchema
}

function returnPallet(res: Response) {
    return (err: MongooseError, pallet: PalletSchema) => {
        if(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
        return res.status(200).json(pallet)
    }
}

function palletsAreSimilar(pallet1: PalletSchema, pallet2: PalletSchema) {
    let copy1 = JSON.parse(JSON.stringify(pallet1))
    let copy2 = JSON.parse(JSON.stringify(pallet2))
    // Delete unimportant information for comparison
    delete copy1.prev
    delete copy1._id
    delete copy1.next
    delete copy1.date_created
    delete copy1.date_replaced
    delete copy1.date_updated
    delete copy1.by
    delete copy1.__v
    // Delete unimportant information for comparison
    delete copy2.prev
    delete copy2._id
    delete copy2.next
    delete copy2.date_created
    delete copy2.date_replaced
    delete copy2.date_updated
    delete copy2.by
    delete copy2.__v
    // Return results of comparison
    return JSON.stringify(copy1) == JSON.stringify(copy2)
}

const palletManager = {

    createPallet: async (req: Request, res: Response) => {
        try {
            // Cleanse pallet
            let pallet = cleansePallet(req.body.pallet as PalletSchema)
            // Get parts on pallet
            let parts = req.body.parts.map((p: CartItem)=>objectSanitize(p, false)) as CartItem[]
            // Get assets on pallet
            let assets = req.body.assets.map((a: string)=>stringSanitize(a, false)) as string[]
            // Check if input is valid
            if(!pallet||!isValidPalletTag(pallet.pallet_tag)||!isLocationValid(pallet.location))
                return res.status(400).send("Invalid request");
            // Try and find existing pallet
            let existingPallet = await Pallet.findOne({pallet_tag: pallet.pallet_tag})
            // Return error if pallet already exists
            if(existingPallet)
                return res.status(400).send("Pallet already exists.");
            // Get user info
            pallet.by = req.user.user_id as string
            // Get current date
            pallet.date_created = new Date()
            // Create pallet
            Pallet.create(cleansePallet(pallet), async (err, newPallet)=>{
                if(err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let date = newPallet.date_created
                // Create all part records
                await Promise.all(parts.map((p)=>{
                    return new Promise<void>(async (res)=>{
                        // If serialized part
                        let createOptions = {
                            nxid: p.nxid,
                            building: newPallet.building,
                            location: "Pallet",
                            pallet_tag: newPallet.pallet_tag,
                            by: req.user.user_id,
                            date_created: date,
                            serial: p.serial,
                            prev: null,
                            next: null
                        }
                        // If part has serial
                        if(createOptions.serial)
                            await PartRecord.create(createOptions)
                        // If unserialized part
                        else if(p.quantity)
                            // Create enough part records to match quantity
                            for(let i = 0; i < p.quantity; i++) {
                                await PartRecord.create(createOptions)
                            }
                        // Resolve promise
                        return res()
                    })
                }))
                // Create/update all assets on pallet
                await Promise.all(assets.map((a)=>{
                    return new Promise<void>(async (res)=>{
                        // Return if invalid asset tag
                        if(!isValidAssetTag(a))
                            return res()
                        // Check if asset already exists
                        let existingAsset = await Asset.findOne({asset_tag: a, next: null}) as AssetSchema
                        // If asset doesn't already exist
                        if(!existingAsset)
                            // Create new empty asset
                            existingAsset = {
                                asset_tag: a,
                                building: newPallet.building,
                                pallet: newPallet.pallet_tag,
                                prev: null,
                                next: null
                            } as AssetSchema
                        // Delete any locatin details
                        delete existingAsset.public_port;
                        delete existingAsset.private_port;
                        delete existingAsset.ipmi_port;
                        delete existingAsset.power_port;
                        delete existingAsset.sid;
                        existingAsset.in_rack = false
                        // Copy pallet information
                        existingAsset.building = newPallet.building
                        existingAsset.pallet = newPallet.pallet_tag
                        existingAsset.date_created = date

                        // @TODO: Update previous asset or create new asset
                        //
                        //
                        //
                        //
                    })
                }))
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPalletByID: async (req: Request, res: Response) => {
        try {
            let id = req.query.id as string
            // Check if it is a pallet tag
            if(isValidPalletTag(id))
                Pallet.find({pallet_id: id}, returnPallet(res))
            // Try to find by ID
            else
                Pallet.findById(id, returnPallet(res))
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    updatePallet: async (req: Request, res: Response) => {
        try {
            // Get data from request body
            let { pallet, parts, correction } = req.body;
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

            let { added, removed, error } = getAddedAndRemoved(parts, existingParts)
            if(error)
                return res.status(400).send("Error in updated parts list");
            // Make sure user has parts in their inventory
            let hasInventory = await userHasInInventory(req.user.user_id, added)
            if(!hasInventory)
                return res.status(400).send("Added parts on request not found in user inventory");
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
            await updateParts(removedOptions, palletSearchOptions, removed, false)
            // Update added parts
            await updateParts(addedOptions, userSearchOptions, added, correction?true:false)
    
            // Update the asset object and return to user before updating parts records
            let getPallet = JSON.parse(JSON.stringify(await Asset.findOne({pallet_tag: pallet.pallet_tag, next: null}))) as PalletSchema
            // Check if assets are similar
            if(!palletsAreSimilar(pallet, getPallet)) {
                // Assets are not similar
                delete pallet._id
                pallet.prev = getPallet._id
                pallet.date_created = current_date
                pallet.by = req.user.user_id
                delete pallet.date_updated
                // Create new asset
                Pallet.create(pallet, (err: CallbackError, new_pallet: PalletSchema) => {
                    if (err) {
                        handleError(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    // Update old asset
                    Pallet.findByIdAndUpdate(new_pallet.prev, { next: new_pallet._id, date_replaced: current_date }, returnPallet(res))
                })
            }
            else {
                // Assets are similar
                // Check if parts were added or removed
                if(added.length>0||removed.length>0) {
                    // If parts were added or removed, set date_updated to current date
                    await Pallet.findByIdAndUpdate(pallet._id, { date_updated: current_date })
                    pallet.date_updated = current_date
                }
                // Return asset
                res.status(200).json(pallet)
            }
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    searchPallets: async (req: Request, res: Response) => {
        try {
            
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
}

export default palletManager

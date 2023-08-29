import PartRecord from "../../model/partRecord.js"
import { CartItem, AssetSchema, PartRecordSchema, AssetEvent, PartSchema } from "../interfaces.js"
import mongoose, { CallbackError, ObjectId } from "mongoose"
import { Response } from "express"
import handleError from "../../config/handleError.js"
import { objectSanitize } from "../../config/sanitize.js"
import callbackHandler from "../../middleware/callbackHandlers.js"
import Asset from "../../model/asset.js"
import Part from "../../model/part.js"
import { isString } from "util"
/**
 * 
 * @param parts 
 * @param asset_tag 
 * @param user_id 
 * @param building 
 * @param date 
 * @returns Promise object for awaits
 */
export function createPartRecordsOnAsset(parts: CartItem[], asset_tag: string, user_id: any, building: number, date: number) {
    return Promise.all(parts.map(async (part) => {
        if(part.serial) {
            await PartRecord.create({
                nxid: part.nxid,
                building: building,
                location: "Asset",
                asset_tag: asset_tag,
                serial: part.serial,
                by: user_id,
                date_created: date
            })
        }
        else {
            for (let i = 0; i < part.quantity!; i++) {
                await PartRecord.create({
                    nxid: part.nxid,
                    building: building,
                    location: "Asset",
                    asset_tag: asset_tag,
                    by: user_id,
                    date_created: date
                })
            }
        }
    }))
}

/**
 *
 *
 *
 *
 *
 */
export function returnAssetSearch(res: Response, numPages: number, numAssets: number) {
    return async (err: CallbackError | null, assets: AssetSchema[])  => {
        if (err) {
            // Database err
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
        // Map for all parts
        return res.status(200).json({numPages, numAssets, assets});
    }
}
/**
 * 
 * @param asset 
 * @returns Copy of asset with extra information removed
 */
export function cleanseAsset(asset: AssetSchema) {
    let newAsset = {} as AssetSchema
    newAsset.asset_tag = asset.asset_tag?.toUpperCase()
    newAsset.building = asset.building
    newAsset.asset_type = asset.asset_type
    newAsset.next = asset.next
    newAsset.prev = asset.prev
    newAsset.by = asset.by
    newAsset.live = asset.live
    newAsset.pallet = asset.pallet
    newAsset.date_created = asset.date_created
    newAsset.date_updated = asset.date_updated
    newAsset.date_replaced = asset.date_replaced
    newAsset.notes = asset.notes
    newAsset.bay = asset.bay
    newAsset.old_by = asset.old_by
    newAsset.model = asset.model
    newAsset.serial = asset.serial
    newAsset.migrated = asset.migrated
    newAsset.manufacturer = asset.manufacturer
    switch(asset.asset_type) {
        case "PDU":
        case "Switch":
            newAsset.fw_rev = asset.fw_rev
            newAsset.power_port = asset.power_port
            break;
        case "Server":
            newAsset.chassis_type = asset.chassis_type
            newAsset.rails = asset.rails
            newAsset.cheat = asset.cheat
            newAsset.units = asset.units
            newAsset.num_psu = asset.num_psu
            newAsset.psu_model = asset.psu_model
            newAsset.parent = asset.parent
            newAsset.cable_type = asset.cable_type
            newAsset.num_bays = asset.num_bays
            newAsset.bay_type = asset.bay_type
            newAsset.in_rack = asset.in_rack
            if(newAsset.in_rack==true) {
                newAsset.power_port = asset.power_port
                newAsset.ipmi_port = asset.ipmi_port
                newAsset.private_port = asset.private_port
                newAsset.public_port = asset.public_port
            }
            if(newAsset.live)
                newAsset.sid = asset.sid
    }
    return objectSanitize(newAsset, false);
}

// Pushes any parts from array2 that array1 does not have to the differenceDest array
// Should probably only be used for getAddedAndRemoved or similar functions
function pushDifferenceSerialized(array1: CartItem[], array2: CartItem[], differenceDest: CartItem[]) {
    array1.map((p)=>{
        let existing = array2.find((e)=>(p.nxid==e.nxid)&&(p.serial==e.serial));
        if(!existing)
            differenceDest.push(p)
    })
}

// Pushes any parts from map2 that map1 does not have to the differenceDest array
// Should probably only be used for getAddedAndRemoved or similar functions
function pushDifferenceUnserialized(map1: Map<string, number>, map2: Map<string, number>, differenceDest: CartItem[]) {
    map1.forEach((v, k)=>{
        if(map2.has(k)) {
            let reqQuantity = map2.get(k)!
            let difference = v - reqQuantity;
            if(difference > 0)
                differenceDest.push({nxid: k, quantity: difference})    
        }
        else {
            differenceDest.push({nxid: k, quantity: v})
        }
    })
}

// Takes an updated parts list and existing parts list and returns the parts added and removed in the 
// updated list
export function getAddedAndRemoved(req_parts: CartItem[], current_parts: PartRecordSchema[]) {
    // Store existing parts in a more usable format
    let unserializedExistingParts = new Map<string, number>();
    let serializedExistingParts = [] as CartItem[];
    let unserializedPartsOnRequest = new Map<string, number>();
    let serializedPartsOnRequest = [] as CartItem[];
    // Map existing records to usable data types
    current_parts.map((p)=>{
        // If part is serialized
        if(p.serial) {
            // Push to array
            return serializedExistingParts.push({ nxid: p.nxid, serial: p.serial } as CartItem);
        }
        // Update map, if map has a number increment or start value at 1 
        return unserializedExistingParts.set(p.nxid!, unserializedExistingParts.has(p.nxid!) ? unserializedExistingParts.get(p.nxid!)!+1 : 1);
    })
    let reqError = false
    // Map parts from request 
    req_parts.map((p: CartItem)=>{
        if(p.serial) {
            // Push to array
            return serializedPartsOnRequest.push({ nxid: p.nxid, serial: p.serial });
        }
        if (p.quantity) {
            return unserializedPartsOnRequest.set(p.nxid, p.quantity);
        }
        return reqError = true
    })
    // If request error
    if(reqError)
        return { added: [], removed: [], error: true}
    // Parts removed from asset
    let removed = [] as CartItem[]
    // Parts added to pallet
    let added = [] as CartItem[]
    // Check for serialized parts removed from pallet

    // Check for removed serialized parts
    pushDifferenceSerialized(serializedExistingParts, serializedPartsOnRequest, removed)
    // Check for added serialized parts
    pushDifferenceSerialized(serializedPartsOnRequest, serializedExistingParts, added)
    

    // Check for removed unserialized parts
    pushDifferenceUnserialized(unserializedExistingParts, unserializedPartsOnRequest, removed)
    // Check for added unserialized parts
    pushDifferenceUnserialized(unserializedPartsOnRequest, unserializedExistingParts, added)
    // Return data with no error
    return { added, removed, error: false}
}

/**
 * 
 * @param parts 
 * @returns Serial number of existing part.  Empty string if none is found
 */
export function findExistingSerial(parts: CartItem[]) {
    return new Promise<string>(async (res)=>{
        let existingSerial = ''
        await Promise.all(parts.map(async(part)=> {
            // If serialized
            if (part.serial) {
                // Check if serial number already exists
                let existing = await PartRecord.findOne({nxid: part.nxid, next: null, serial: part.serial});
                // If exists, set sentinel value
                if(existing)
                    existingSerial = part.serial
            }
        }))
        res(existingSerial)
    })
}

/**
 * 
 * @param createOptions 
 * @param searchOptions
 * @param arr 
 */
export function updateParts(createOptions: PartRecordSchema, searchOptions: PartRecordSchema, arr: CartItem[], migrated: boolean) {
    return Promise.all(arr.map(async (p)=>{
        // Create Options
        let cOptions = JSON.parse(JSON.stringify(createOptions)) as PartRecordSchema
        // Search options
        let sOptions = JSON.parse(JSON.stringify(searchOptions)) as PartRecordSchema
        sOptions.nxid = p.nxid
        cOptions.nxid = p.nxid
        if(p.serial) {
            cOptions.serial = p.serial
            sOptions.serial = p.serial
            if (migrated) {
                // Check if serial already exists
                let existing = await PartRecord.findOne({nxid: p.nxid, serial: p.serial, next: null})
                // Skip creation - avoid duplication
                if(existing)
                    return
            } else {
                // Check if prev exists
                let prev = await PartRecord.findOne(sOptions)
                if(!prev)
                    return
                cOptions.prev = prev._id
            }
            PartRecord.create(cOptions, callbackHandler.updateRecord)
        }
        else if(p.quantity) {
            if(migrated) {
                for (let i = 0; i < p.quantity; i++) {
                    PartRecord.create(cOptions, callbackHandler.callbackHandleError)
                }
            }
            else {
                let toBeUpdated = await PartRecord.find(sOptions)
                if (toBeUpdated.length < p.quantity)
                return
                for (let i = 0; i < p.quantity; i++) {
                    cOptions.prev = toBeUpdated[i]._id
                    PartRecord.create(cOptions, callbackHandler.updateRecord)
                }
            }
        }
    }))
}

/**
 * 
 * @param asset1 
 * @param asset2 
 * @returns True if assets are similar.  False if assets are not.
 */
export function assetsAreSimilar(asset1: AssetSchema, asset2: AssetSchema) {
    // MAKE COPIES!!!!
    let copy1 = JSON.parse(JSON.stringify(asset1))
    let copy2 = JSON.parse(JSON.stringify(asset2))
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
export function returnAssets(res: Response) {
    return (err: CallbackError, records: AssetSchema[]) => {
        if (err)
            res.status(500).send("API could not handle your request: " + err);
        else
            res.status(200).json(records);
    }
}

export function returnAsset(res: Response) {
    return (err: CallbackError, record: AssetSchema) => {
        if (err)
            res.status(500).send("API could not handle your request: " + err);
        else
            res.status(200).json(record);
    }
}

export function getAddedPartsAsset(asset_tag: string, date: Date) {
    return PartRecord.aggregate([
        {
            $match: { asset_tag: asset_tag, date_created: date }
        },
        {
            $group: { 
                _id: { nxid: "$nxid", serial: "$serial", by: "$by" },
                quantity: { $sum: 1 }
            }
        },
        {
            $project: {
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                by: "$_id.by",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export function getRemovedPartsAsset(asset_tag: string, date: Date) {
    return PartRecord.aggregate([
        {
            $match: { asset_tag: asset_tag, date_replaced: date }
        },
        {
            $group: { 
                _id: { nxid: "$nxid", serial: "$serial", next_owner: "$next_owner" },
                next: { $push: "$next" },
                quantity: { $sum: 1 }
            }
        },
        {
            $project: {
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                next_owner: "$_id.next_owner",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export function getExistingPartsAsset(asset_tag: string, date: Date) {
    return new Promise<any[]>(async (res)=>{
        let existing = await PartRecord.aggregate([
            {
                $match: { asset_tag: asset_tag, date_created: { $lt: date },date_replaced: { $gt: date }}
            },
            {
                $group: { 
                    _id: { nxid: "$nxid", serial: "$serial" },
                    quantity: { $sum: 1 }
                }
            },
            {
                $project: {
                    nxid: "$_id.nxid",
                    serial: "$_id.serial",
                    quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
                }
            }
        ])
        existing = existing.concat(await PartRecord.aggregate([
            {
                $match: { asset_tag: asset_tag, date_created: { $lt: date },date_replaced: null }
            },
            {
                $group: { 
                    _id: { nxid: "$nxid", serial: "$serial" },
                    quantity: { $sum: 1 }
                }
            },
            {
                $project: {
                    nxid: "$_id.nxid",
                    serial: "$_id.serial",
                    quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
                }
            }
        ]))
        res(existing)
    })
}

export function getAssetEvent(asset_tag: string, d: Date) {
    return new Promise<AssetEvent>(async (res)=>{
        // Get parts removed from asset
        let added = await getAddedPartsAsset(asset_tag, d)
        // Get parts added to asset
        let removed = await getRemovedPartsAsset(asset_tag, d)
        // Get parts already on asset
        let existing = await getExistingPartsAsset(asset_tag, d)
        // Find current asset iteratio
        let current_asset = await Asset.findOne({asset_tag: asset_tag, date_created: { $lte: d }, date_replaced: { $gt: d }}) as AssetSchema
        // 
        if(current_asset==null)
            current_asset = await Asset.findOne({asset_tag: asset_tag, date_created: { $lte: d }, next: null }) as AssetSchema
        // Who updated
        let by = ""
        // Added parts for mapping
        let addedParts = [] as CartItem[]
        if(current_asset&&d.getTime()==current_asset.date_created!.getTime())
            by = current_asset.by as string
        // Remap removed parts, find by attribute
        if(Array.isArray(added))
            addedParts = added.map((a)=>{
                if(by==""&&a.by)
                    by = a.by
                return { nxid: a.nxid, serial: a.serial, quantity: a.quantity } as CartItem
            })
        let removedParts = [] as CartItem[]
        // Remap removed parts, find by attribute
        if(Array.isArray(removed))
            removedParts = removed.map((a)=>{
                if(by==""&&a.next_owner) {
                    by = a.next_owner
                }
                return { nxid: a.nxid, serial: a.serial, quantity: a.quantity } as CartItem
            })
        // If no by is found
        if(current_asset&&current_asset.by&&by=="")
            by = current_asset.by as string
        return res({ date_begin: d, asset_id: current_asset._id, info_updated: ((added.length==0&&removed.length==0)||current_asset.date_created!.getTime() == d.getTime()), existing: existing as CartItem[], added: addedParts, removed: removedParts, by: by } as AssetEvent)
    })
}

export function isValidAssetTag(asset_tag: string) {
    return /WNX([0-9]{7})+/.test(asset_tag)
}

export function getAssetUpdateDates(asset_tag: string) {
    return new Promise<Date[]>(async(res)=>{
        let dates = [] as Date[]
        // Get all the dates of asset related events
        dates = dates.concat(await PartRecord.find({asset_tag}).distinct("date_created") as Date[])
        dates = dates.concat(await PartRecord.find({asset_tag}).distinct("date_replaced") as Date[])
        dates = dates.concat(await Asset.find({asset_tag}).distinct("date_created") as Date[])
        dates = dates.concat(await Asset.find({asset_tag}).distinct("date_replaced") as Date[])
        // Get rid of duplicates
        // Sort
        dates = dates.sort((a: Date, b: Date) => { 
            if (a < b)
                return 1
            return -1
        })
        // Get rid of duplicates
        dates = dates
            .filter((d)=>d!=null)
            .map((d)=>d.getTime())
            .filter((date, index, arr) => arr.indexOf(date) === index && date != null)
            .map((d)=>new Date(d))
        res(dates)
    })
}

export function returnAssetHistory(pageNum: number, pageSize: number, res: Response){
    return async (err: CallbackError, asset: AssetSchema) => {
        if (err)
            return res.status(500).send("API could not handle your request: " + err);

        let dates = await getAssetUpdateDates(asset.asset_tag!)
        let pageSkip = pageSize * (pageNum - 1)
        let totalEvents = dates.length
        
        dates = dates
            .splice(pageSkip, pageSize)
        // Get history
        let history = await Promise.all(dates.map((d)=>{
            return getAssetEvent(asset.asset_tag!, d)
        }))
        let pages = Math.ceil(totalEvents/pageSize)
        // Return to client
        res.status(200).json({total: totalEvents, pages, events: history})
    }
}


/**
 *  
 *
 *
 */
export function userHasInInventory(user_id: string|mongoose.Types.ObjectId, inventory: CartItem[]) {
    return new Promise<boolean>((res)=>{
        PartRecord.find({owner: user_id, next: null}, (err: CallbackError, userInventoryRecords: PartRecordSchema[])=>{
            // If error, user likely does not exist
            if(err)
                return res(false)
            // Any parts "added" would not already be in users inventory
            let { added, error } = getAddedAndRemoved(inventory, userInventoryRecords)
            // If function encounters error
            if(error)
                return res(false)
            // If added has no members, we can assume the user has all the parts listed in their inventory
            res(added.length==0)
        })
    })
}


export function partRecordsToCartItems(records: PartRecordSchema[]) {
    // Map for unserialized parts
    let unserializedParts = new Map<string, number>();
    // Array that is returned to client
    let cartItems = [] as CartItem[]
    // Map part records
    records.map((record) => {
        // If serialized, push to return array
        if(record.serial) {
            return cartItems.push({nxid: record.nxid!, serial: record.serial })
        }
        // If unserialized, update map
        unserializedParts.set(record.nxid!, unserializedParts.has(record.nxid!) ? unserializedParts.get(record.nxid!)! + 1 : 1)
    })
    // Get part info and push as LoadedCartItem interface from the front end
    unserializedParts.forEach((quantity, nxid) => {
        cartItems.push({nxid: nxid, quantity: quantity})
    })
    return cartItems
}

export function partRecordsToCartItemsWithInfo(records: PartRecordSchema[]) {
    return new Promise<{parts: PartSchema[], records: CartItem[]}>(async (res)=>{
        // Turn records into cart items
        let cartItems = partRecordsToCartItems(records)
        // Part info cache
        let cachedInfo = new Map<string, PartSchema>();
        // Check all cart items
        await Promise.all(cartItems.map(async (item) =>{
            // Check if part is cached
            if (!cachedInfo.has(item.nxid)) {
                // Set temp value
                cachedInfo.set(item.nxid, {})
                // Find part
                let part = await Part.findOne({nxid: item.nxid})
                // Check if exists
                if(part) {
                    // If part was found, add to cache
                    cachedInfo.set(item.nxid, part)
                }
                else {
                    // Part not found, remove temp value from cache
                    cachedInfo.delete(item.nxid)
                }
            }
        }))
        // Turn map into array
        let parts = Array.from(cachedInfo, (record) => {
            return { nxid: record[0], part: record[1]}
        })
        // Return
        res({ parts: parts, records: cartItems})
    })
}

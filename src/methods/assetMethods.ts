import PartRecord from "../model/partRecord.js"
import { CartItem, AssetSchema, PartRecordSchema, AssetEvent, InventoryEntry } from "../interfaces.js"
import mongoose, { CallbackError, isValidObjectId } from "mongoose"
import { Response } from "express"
import handleError from "../util/handleError.js"
import { objectSanitize } from "../util/sanitize.js"
import callbackHandler from "../util/callbackHandlers.js"
import Asset from "../model/asset.js"
import Part from "../model/part.js"

/**
 *
 *
 *
 *
 *
 */
export function returnAssetSearch(res: Response, numPages: number, numAssets: number) {
    return (err: CallbackError | null, assets: AssetSchema[])  => {
        if (err) {
            // Database err
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
        return res.status(200).json({pages: numPages, total: numAssets, items: assets});
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
            if(newAsset.in_rack==true||newAsset.live) {
                newAsset.power_port = asset.power_port
                newAsset.ipmi_port = asset.ipmi_port
                newAsset.private_port = asset.private_port
                newAsset.public_port = asset.public_port
                delete newAsset.pallet
            }
            if(newAsset.live==true)
                newAsset.sid = asset.sid
    }
    return objectSanitize(newAsset, false);
}

// Pushes any parts from array2 that array1 does not have to the differenceDest array
// Should probably only be used for getAddedAndRemoved or similar functions
function pushDifferenceSerialized(array1: CartItem[], array2: CartItem[], differenceDest: CartItem[]) {
    for (let i = 0; i < array1.length; i++) {
        let existing = array2.find((e)=>(array1[i].nxid==e.nxid)&&(array1[i].serial==e.serial));
        if(!existing)
            differenceDest.push(JSON.parse(JSON.stringify(array1[i])))
    }
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

// If serialized match doesn't exist, function will attempt to match with unserialized part
// Useful for adding serial numbers to parts while accomodating existing serial numbers.
function pushDifferenceAddingSerials(array1: CartItem[], array2: CartItem[], differenceDest: CartItem[]) {
    // Copy unserialized to a new new array
    let array2unserialized = array2.filter((v)=>v.serial==undefined)
    let array1unserialized = array1.filter((v)=>v.serial==undefined)
    // Copy serialized to a new new array
    let array2serialized = JSON.parse(JSON.stringify(array2.filter((v)=>v.serial!=undefined))) as CartItem[]
    let array1serialized = JSON.parse(JSON.stringify(array1.filter((v)=>v.serial!=undefined))) as CartItem[]
    // Create maps for unserialized
    let unserializedMap2 = new Map<string, number>()
    let unserializedMap1 = new Map<string, number>()
    // Fill the map
    for(let cartItem of array2unserialized) {
        // declare var
        let q = 0
        // If map already has part
        if(unserializedMap2.has(cartItem.nxid))
            // Get the existing quantity
            q = unserializedMap2.get(cartItem.nxid)!
        // Add the cartItem quantity or 1 if it doesn't exist
        q += cartItem.quantity ? cartItem.quantity : 1
        // Update the map
        unserializedMap2.set(cartItem.nxid, q)
    }
    // Fill the map
    for(let cartItem of array1unserialized) {
        // declare var
        let q = 0
        // If map already has part
        if(unserializedMap1.has(cartItem.nxid))
            // Get the existing quantity
            q = unserializedMap1.get(cartItem.nxid)!
        // Add the cartItem quantity or 1 if it doesn't exist
        q += cartItem.quantity ? cartItem.quantity : 1
        // Update the map
        unserializedMap1.set(cartItem.nxid, q)
    }
    // Loop through the serialized parts
    for (let i = 0; i < array1serialized.length; i++) {
        // Find a match
        let existing = array2serialized.find((e: CartItem)=>(array1serialized[i].nxid==e.nxid)&&(array1serialized[i].serial==e.serial));
        // If match exists
        if(existing) {
            // Delete the element
            array2serialized.splice(array2serialized.indexOf(existing), 1)
            // Move on to next one
            continue
        }
        // If serial match doesn't exist, but unserialized exists
        else if(!existing&&unserializedMap2.has(array1serialized[i].nxid)) {
            // Get the quantity
            let q = unserializedMap2.get(array1serialized[i].nxid)!
            // If quantity is not zero
            if(q>0) {
                // Decrement
                q -= 1
                // Update if there's still parts left
                if(q<1)
                    unserializedMap2.delete(array1serialized[i].nxid)
                else
                    unserializedMap2.set(array1serialized[i].nxid, q)
                continue
            }
            // No quantity to match, delete but don't continue
            // Will hit catch all below
            else {
                unserializedMap2.delete(array1serialized[i].nxid)
            }
        }
        // Final catch all for parts with no match.
        differenceDest.push(JSON.parse(JSON.stringify(array1serialized[i])))
    }
    // Loop through the unserialized parts
    unserializedMap1.forEach((v, k)=>{
        // If other map has part
        if(unserializedMap2.has(k)) {
            // Get quantity
            let q = unserializedMap2.get(k)!
            // Clamp the value
            let diff = q > v ? v : q
            // If there is still some left, set new q
            if(q-diff > 0)
                unserializedMap2.set(k, q-diff)
            // None left - delete from map
            else
                unserializedMap2.delete(k)
            // Set new quantity
            v -= diff
        }
        // Search serialized arrays here
        let index = array2serialized.findIndex((p)=>p.nxid==k)
        // While the serialized array has items to match
        while(index!=-1&&v>0) {
            // Remove the element
            array2serialized.splice(index, 1)
            // Decrement
            v -= 1
            // Find new index
            index = array2serialized.findIndex((p)=>p.nxid==k)
        }
        // Push any leftovers to difference array
        if (v>0)
            differenceDest.push({nxid: k, quantity: v})
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

    // You could probably use partRecordsToCartItemHere and create another method for the loop

    // Map existing records to usable data types
    for (let i = 0; i < current_parts.length; i++) {
        if(current_parts[i].serial) {
            serializedExistingParts.push({ nxid: current_parts[i].nxid, serial: current_parts[i].serial } as CartItem);
            continue
        }
        unserializedExistingParts.set(current_parts[i].nxid!, unserializedExistingParts.has(current_parts[i].nxid!) ? unserializedExistingParts.get(current_parts[i].nxid!)!+1 : 1);
    }
    let reqError = false
    // Map parts from request 
    for(let i = 0; i < req_parts.length; i++) {
        if(req_parts[i].serial) {
            // Push to array
            serializedPartsOnRequest.push({ nxid: req_parts[i].nxid, serial: req_parts[i].serial });
            continue
        }
        if (req_parts[i].quantity) {
            unserializedPartsOnRequest.set(req_parts[i].nxid, req_parts[i].quantity!);
            continue
        }
        reqError = true
        break
    }
    // If request error
    if(reqError)
        return { added: [], removed: [], error: true}
    // Parts removed
    let removed = [] as CartItem[]
    // Parts added
    let added = [] as CartItem[]
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


// Takes an updated parts list and existing parts list and returns the parts added and removed in the 
// updated list
export function getAddedAndRemovedIgnoreSerials(req_parts: CartItem[], current_parts: PartRecordSchema[]) {
    // Store existing parts in a more usable format
    let unserializedExistingParts = new Map<string, number>();
    let unserializedPartsOnRequest = new Map<string, number>();

    // You could probably use partRecordsToCartItemHere and create another method for the loop

    // Map existing records to usable data types
    for (let i = 0; i < current_parts.length; i++) {
        unserializedExistingParts.set(current_parts[i].nxid!, unserializedExistingParts.has(current_parts[i].nxid!) ? unserializedExistingParts.get(current_parts[i].nxid!)!+1 : 1);
    }
    let reqError = false
    // Map parts from request 
    for(let i = 0; i < req_parts.length; i++) {
        if(req_parts[i].serial) {
            req_parts[i].quantity = 1
        }
        if (req_parts[i].quantity) {
            unserializedPartsOnRequest.set(req_parts[i].nxid, req_parts[i].quantity!);
            continue
        }
        reqError = true
        break
    }
    // If request error
    if(reqError)
        return { added: [], removed: [], error: true}
    // Parts removed
    let removed = [] as CartItem[]
    // Parts added
    let added = [] as CartItem[]
    // Check for removed unserialized parts
    pushDifferenceUnserialized(unserializedExistingParts, unserializedPartsOnRequest, removed)
    // Check for added unserialized parts
    pushDifferenceUnserialized(unserializedPartsOnRequest, unserializedExistingParts, added)
    // Return data with no error
    return { added, removed, error: false}
}

export function getAddedAndRemovedWithNewSerials(req_parts: CartItem[], current_parts: PartRecordSchema[]) {
    // Convert to usable parts
    let currentCartItems = partRecordsToCartItems(current_parts)
    // Parts removed
    let removed = [] as CartItem[]
    // Parts added
    let added = [] as CartItem[]
    // Do the array magic
    pushDifferenceAddingSerials(currentCartItems, req_parts, removed)
    pushDifferenceAddingSerials(req_parts, currentCartItems, added)
    // Return data with no error
    return { added, removed }
}

// Takes an updated parts list and existing parts list and returns the parts added and removed in the 
// updated list
export function getAddedAndRemovedCartItems(req_parts: CartItem[], current_parts: CartItem[]) {
    // Store existing parts in a more usable format
    let unserializedExistingParts = new Map<string, number>();
    let serializedExistingParts = [] as CartItem[];
    let unserializedPartsOnRequest = new Map<string, number>();
    let serializedPartsOnRequest = [] as CartItem[];
    let reqError = false
    // Map parts from request 
    for(let i = 0; i < req_parts.length; i++) {
        if(req_parts[i].serial) {
            // Push to array
            serializedPartsOnRequest.push({ nxid: req_parts[i].nxid, serial: req_parts[i].serial });
            continue
        }
        if (req_parts[i].quantity) {
            unserializedPartsOnRequest.set(req_parts[i].nxid, req_parts[i].quantity!);
            continue
        }
        reqError = true
        break
    }
    // If request error
    if(reqError)
        return { added: [], removed: [], error: true}
    for(let i = 0; i < current_parts.length; i++) {
        if(current_parts[i].serial) {
            // Push to array
            serializedExistingParts.push({ nxid: current_parts[i].nxid, serial: current_parts[i].serial });
            continue
        }
        if (current_parts[i].quantity) {
            unserializedExistingParts.set(current_parts[i].nxid, current_parts[i].quantity!);
            continue
        }
        reqError = true
        break
    }
    // If request error
    if(reqError)
        return { added: [], removed: [], error: true}
    // Parts removed
    let removed = [] as CartItem[]
    // Parts added
    let added = [] as CartItem[]
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
export async function findExistingSerial(parts: CartItem[]) {
    let existingSerial = ''
    await Promise.all(parts.map(async (part)=> {
        // If serralized
        if (part.serial) {
            // Check if serial number already exists
            let existing = await PartRecord.findOne({nxid: part.nxid, next: null, serial: part.serial});
            // If exists, set sentinel value
            if(existing)
                existingSerial = part.serial
        }
    }))
    return existingSerial
}

/**
 * 
 * @param createOptions 
 * @param searchOptions
 * @param arr 
 */
export function updatePartsAsync(createOptions: PartRecordSchema, searchOptions: PartRecordSchema, arr: CartItem[], migrated: boolean) {
    return Promise.all(arr.map(async (p)=>{
        // Create Options
        let cOptions = JSON.parse(JSON.stringify(createOptions)) as PartRecordSchema|any
        // Search options
        let sOptions = JSON.parse(JSON.stringify(searchOptions)) as PartRecordSchema|any
        sOptions.nxid = p.nxid
        cOptions.nxid = p.nxid
        //Check consumable
        let partInfo = await Part.findOne({nxid: p.nxid})
        if(partInfo&&partInfo.consumable == true)
            cOptions.next = "consumed"
        if(p.serial) {
            cOptions.serial = p.serial
            sOptions.serial = p.serial
            if (migrated) {
                // Check if serial already exists
                let existing = await PartRecord.findOne({nxid: p.nxid, serial: p.serial, next: null})
                // Skip creation - avoid duplication
                if(existing) {
                    return
                }
            } else {
                // Check if prev exists
                let prev = await PartRecord.findOne(sOptions)
                if(!prev) {
                    return
                }
                cOptions.prev = prev._id
                if(prev.buy_price)
                    cOptions.buy_price = prev.buy_price
            }
            PartRecord.create(cOptions, callbackHandler.updateRecord)
            return
        }
        else if(p.quantity) {
            if(migrated) {
                for (let i = 0; i < p.quantity; i++) {
                    PartRecord.create(cOptions, callbackHandler.callbackHandleError)
                }
            }
            else {
                sOptions.serial = null
                let toBeUpdated = await PartRecord.find(sOptions)
                if (toBeUpdated.length < p.quantity) {
                    return
                }
                for (let i = 0; i < p.quantity; i++) {
                    cOptions.prev = toBeUpdated[i]._id

                    if(toBeUpdated[i].buy_price)
                        cOptions.buy_price = toBeUpdated[i].buy_price
                    PartRecord.create(cOptions, callbackHandler.updateRecord)
                }
            }
        }
    }))
}

export function updatePartsClearSerialsAsync(createOptions: PartRecordSchema, searchOptions: PartRecordSchema, arr: CartItem[], migrated: boolean) {
    return Promise.all(arr.map(async (p)=>{
        // Create Options
        let cOptions = JSON.parse(JSON.stringify(createOptions)) as PartRecordSchema|any
        // Search options
        let sOptions = JSON.parse(JSON.stringify(searchOptions)) as PartRecordSchema|any
        sOptions.nxid = p.nxid
        cOptions.nxid = p.nxid
        //Check consumable
        let partInfo = await Part.findOne({nxid: p.nxid})
        if(partInfo&&partInfo.consumable == true)
            cOptions.next = "consumed"
        if(p.serial) {
            // cOptions.serial = p.serial
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
                if(prev.buy_price)
                    cOptions.buy_price = prev.buy_price
            }
            PartRecord.create(cOptions, callbackHandler.updateRecord)
            return
        }
        else if(p.quantity) {
            if(migrated) {
                for (let i = 0; i < p.quantity; i++) {
                    PartRecord.create(cOptions, callbackHandler.callbackHandleError)
                }
                return
            }
            else {
                sOptions.serial = null
                let toBeUpdated = await PartRecord.find(sOptions)
                if (toBeUpdated.length < p.quantity)
                    return
                for (let i = 0; i < p.quantity; i++) {
                    cOptions.prev = toBeUpdated[i]._id
                    if(toBeUpdated[i].buy_price)
                        cOptions.buy_price = toBeUpdated[i].buy_price
                    PartRecord.create(cOptions, callbackHandler.updateRecord)
                }
                return
            }
        }
        // No quantity or serial - do nothing
        return
    }))
}

function getUpdatedAndSkippedOnUpdate(parts: { nxid: string, quantity: number, serials: string[], skippedSerials: string[], skippedUnserialized: number }[]) {
    let updated = []
    let skipped = []
    // Loop through the returned parts
    for(let p of parts) {
        // If unserialized parts > 0
        if(p.quantity>0)
            // Push unserialized to return array
            updated.push({nxid: p.nxid, quantity: p.quantity})
        // If serials
        if(p.serials) {
            // Add each one as cart item to return array
            p.serials.forEach((v)=>{
                updated.push({nxid: p.nxid, serial: v})
            })
        }
        // If serials were skipped
        if(p.skippedSerials) {
            // Add each one as cart item to return array
            p.skippedSerials.forEach((v)=>{
                skipped.push({nxid: p.nxid, serial: v})
            })
        }
        // If unserialized were skipped
        if(p.skippedUnserialized>0)
            skipped.push({nxid: p.nxid, quantity: p.skippedUnserialized})
    }
    // Return the parts that were updated
    return { updated, skipped } 
}

export async function updatePartsAddSerialsDryRunAsync(searchOptions: PartRecordSchema, arr: InventoryEntry[]) {
    let parts = await Promise.all(arr.map(async (p)=>{
        let count = 0
        let serials = [] as string[]
        let skippedUnserialized = 0
        let skippedSerials = [] as string[]
        // Search options
        let sOptions = JSON.parse(JSON.stringify(searchOptions)) as any
        sOptions.nxid = p.nxid
        sOptions.serial = { $eq: undefined }
        let toBeUpdated = await PartRecord.find(sOptions)
        //Check consumable
        let i = 0
        for (i=0; i < p.unserialized; i++) {
            // Make sure there is a record to update
            if(toBeUpdated[i]) {
                // Update record
                count++
            }
            // No more records to update, break loop
            else {
                skippedUnserialized = p.unserialized - i
                break
            }
        }
        // For parts that already have serials
        for(let serial of p.serials) {
            // Set create and search options serial
            sOptions.serial = serial
            // Find previous
            let prev = await PartRecord.findOne(sOptions)
            // If no previous
            if(!prev) {
                // Check if unserialized parts are left
                if(i<toBeUpdated.length) {
                    prev = toBeUpdated[i]
                    i++
                }
                // If no previous is found, skip
                else {
                    skippedSerials.push(serial)
                    continue
                }
            }
            serials.push(serial)
        }
        return { nxid: p.nxid!, quantity: count, serials, skippedSerials, skippedUnserialized }
    }))
    return getUpdatedAndSkippedOnUpdate(parts)
}

export async function updatePartsAddSerialsAsync(createOptions: PartRecordSchema, searchOptions: PartRecordSchema, arr: InventoryEntry[], prices?: Map<string, number>) {
    let parts = await Promise.all(arr.map(async (p)=>{
        let count = 0
        let serials = [] as string[]
        let skippedUnserialized = 0
        let skippedSerials = [] as string[]
        // Create Options
        let cOptions = JSON.parse(JSON.stringify(createOptions)) as PartRecordSchema
        // Search options
        let sOptions = JSON.parse(JSON.stringify(searchOptions)) as any
        sOptions.nxid = p.nxid
        cOptions.nxid = p.nxid
        sOptions.serial = { $eq: undefined }
        let toBeUpdated = await PartRecord.find(sOptions)
        //Check consumable
        let partInfo = await Part.findOne({nxid: p.nxid})
        if(partInfo&&partInfo.consumable == true)
            cOptions.next = "consumed"
        let i = 0
        for (i=0; i < p.unserialized; i++) {
            // Make sure there is a record to update
            if(toBeUpdated[i]) {
                // Update record
                cOptions.prev = toBeUpdated[i]._id
                if(toBeUpdated[i].buy_price)
                    cOptions.buy_price = toBeUpdated[i].buy_price
                if(prices&&prices.has(p.nxid!))
                    cOptions.sale_price = prices.get(p.nxid!)!

                PartRecord.create(cOptions, callbackHandler.updateRecord)
                count++
            }
            // No more records to update, break loop
            else {
                skippedUnserialized = p.unserialized - i
                break
            }
        }
        // For parts that already have serials
        for(let serial of p.serials) {
            // Set create and search options serial
            sOptions.serial = serial
            cOptions.serial = serial
            // Find previous
            let prev = await PartRecord.findOne(sOptions)
            // If no previous
            if(!prev) {
                // Check if unserialized parts are left
                if(i<toBeUpdated.length) {
                    prev = toBeUpdated[i]
                    i++
                }
                // If no previous is found, skip
                else {
                    skippedSerials.push(serial)
                    continue
                }
            }
            // Set prvious
            cOptions.prev = prev._id
            if(prev.buy_price)
                cOptions.buy_price = prev.buy_price
            if(prices&&prices.has(p.nxid!))
                cOptions.sale_price = prices.get(p.nxid!)!
            // Update record
            PartRecord.create(cOptions, callbackHandler.updateRecord)
            serials.push(serial)
        }
        return { nxid: p.nxid!, quantity: count, serials, skippedSerials, skippedUnserialized }
    }))
    return getUpdatedAndSkippedOnUpdate(parts)
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

export function returnAsset(res: Response) {
    return (err: CallbackError, record: AssetSchema) => {
        if (err)
            res.status(500).send("API could not handle your request: " + err);
        else
            res.status(200).json(record);
    }
}

export function getAddedPartsAssetAsync(asset_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                asset_tag: asset_tag,
                date_created: date,
                next: {$ne: 'deleted'},
                nxid: nxids ? { $in: nxids } : { $ne: null }
            }
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

export function getRemovedPartsAssetAsync(asset_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                asset_tag: asset_tag,
                date_replaced: date,
                nxid: nxids ? { $in: nxids } : { $ne: null }
            }
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
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]},
                next: "$next"
            }
        }
    ])
}

export function getExistingPartsAssetAsync(asset_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: { 
                asset_tag: asset_tag,
                date_created: { $lt: date }, $or: [
                    {date_replaced: null}, 
                    {date_replaced: { $gt: date }}
                ],
                nxid: nxids ? { $in: nxids } : { $ne: null }
            }
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
}

export async function getAssetEventAsync(asset_tag: string, d: Date, nxids?: string[]) {
    // Get parts removed from asset
    let added = await getAddedPartsAssetAsync(asset_tag, d, nxids)
    // Get parts added to asset
    let removed = await getRemovedPartsAssetAsync(asset_tag, d, nxids)
    // Get parts already on asset
    let existing = await getExistingPartsAssetAsync(asset_tag, d, nxids)
    // Find current asset iteratio
    let current_asset = await Asset.findOne({asset_tag: asset_tag, date_created: { $lte: d }, date_replaced: { $gt: d }}) as AssetSchema
    // If most recent iteration of asset
    if(current_asset==null)
        current_asset = await Asset.findOne({asset_tag: asset_tag, date_created: { $lte: d }, $or:[
            {next: null},
            {next:"deleted"},
            {next:"sold"},

        ]}) as AssetSchema
    // Who updated
    let by = ""
    // Added parts for mapping
    let addedParts = [] as CartItem[]
    // Remap removed parts, find by attribute
    if(Array.isArray(added))
        addedParts = added.map((a)=>{
            if(by==""&&a.by) {
                by = a.by
            }
            return { nxid: a.nxid, serial: a.serial, quantity: a.quantity } as CartItem
        })
    let removedParts = [] as CartItem[]
    // Remap removed parts, find by attribute
    if(Array.isArray(removed)) {
        removedParts = removed.map((a)=>{
            if(by==""&&a.next_owner) {
                by = a.next_owner
            }
            return { nxid: a.nxid, serial: a.serial, quantity: a.quantity } as CartItem
        })
    }
    // If no by is found
    if(current_asset&&current_asset.by&&by=="") {
        if(current_asset&&d.getTime()==current_asset.date_created!.getTime())
            by = current_asset.by as string
        // Check removed parts
        // If they were deleted in any way, next_owner would not be present
        // Next record will have to be checked to get an accurate by value
        if(by=="")
            for (let r of removed) {
                // Loop through all next IDs
                for (let n of Array.from((r as any).next as any[])) {
                    // Find part
                    let p = await PartRecord.findById(n)
                    // If part is found
                    if(p&&!isValidObjectId(p.next)) {
                        if(p.owner)
                            by = p.owner as string
                        else
                            by = p.by as string
                        break
                    }
                }
                // If by was found, break outer loop
                if(by!="")
                    break
            }
        // Final catch all
        if(by=="") {
            console.log("FINAL CATCH ALL")
            by = current_asset.by as string
        }
    }
    return { date_begin: d, asset_id: current_asset._id, info_updated: ((added.length==0&&removed.length==0)||current_asset.date_created!.getTime() == d.getTime()), existing: existing as CartItem[], added: addedParts, removed: removedParts, by: by } as AssetEvent
}

export function isValidAssetTag(asset_tag: string) {
    return /WNX([0-9]{7})+/.test(asset_tag)
}

export async function getAssetUpdateDatesAsync(asset_tag: string) {
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
    return dates
        .filter((d)=>d!=null)
        .map((d)=>d.getTime())
        .filter((date, index, arr) => arr.indexOf(date) === index && date != null)
        .map((d)=>new Date(d))
}

export function returnAssetHistory(pageNum: number, pageSize: number, res: Response){
    return async (err: CallbackError, asset: AssetSchema) => {
        if (err)
            return res.status(500).send("API could not handle your request: " + err);
        let dates = await getAssetUpdateDatesAsync(asset.asset_tag!)
        let pageSkip = pageSize * (pageNum - 1)
        let totalEvents = dates.length
        
        dates = dates
            .splice(pageSkip, pageSize)
        // Get history
        let history = await Promise.all(dates.map((d)=>{
            return getAssetEventAsync(asset.asset_tag!, d)
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
export async function userHasInInventoryAsync(user_id: string|mongoose.Types.ObjectId, inventory: CartItem[]) {
    return PartRecord.find({owner: user_id, next: null})
    .then((userInventoryRecords: PartRecordSchema[]) => {
        // Any parts "added" would not already be in users inventory
        let { added, error } = getAddedAndRemoved(inventory, userInventoryRecords)
        // If function encounters error
        if(error)
            return false
        // If added has no members, we can assume the user has all the parts listed in their inventory
        return added.length==0
    })
    // Error - just return false
    .catch(()=>{
        return false
    })
}


export function partRecordsToCartItems(records: PartRecordSchema[]) {
    // Map for unserialized parts
    let unserializedParts = new Map<string, number>();
    // Array that is returned to client
    let cartItems = [] as CartItem[]
    // Map part records
    for(let i = 0; i < records.length; i++) {
        // If serialized, push to return array
        if(records[i].serial) {
            cartItems.push({nxid: records[i].nxid!, serial: records[i].serial })
            continue
        }
        // If unserialized, update map
        unserializedParts.set(records[i].nxid!, unserializedParts.has(records[i].nxid!) ? unserializedParts.get(records[i].nxid!)! + 1 : 1)
    }
    // Get part info and push as LoadedCartItem interface from the front end
    unserializedParts.forEach((quantity, nxid) => {
        cartItems.push({nxid: nxid, quantity: quantity})
    })
    return cartItems as CartItem[]
}

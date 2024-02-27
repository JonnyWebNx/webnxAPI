import { CartItem, PartSchema, PartRecordSchema, UserSchema, InventoryEntry } from "../../interfaces.js"
import { CallbackError } from "mongoose"
import Part from "../../model/part.js"
import { getAddedAndRemovedIgnoreSerials } from "./assetMethods.js"
import PartRecord from "../../model/partRecord.js"
import { objectSanitize } from "../../util/sanitize.js"
import User from "../../model/user.js"
import { Request, Response } from "express"
import handleError from "../../util/handleError.js"

export function cleansePart(part: PartSchema) {
    let newPart = {} as PartSchema
    newPart.nxid = part.nxid?.toUpperCase()
    newPart.manufacturer = part.manufacturer
    newPart.name = part.name
    newPart.type = part.type
    newPart.shelf_location = part.shelf_location
    newPart.rack_num = part.rack_num
    newPart.serialized = part.serialized        
    newPart.notes = ""
    if(part.notes)
        newPart.notes = part.notes
    switch(part.type) {
        case "Memory":
            newPart.frequency = part.frequency
            newPart.capacity = part.capacity
            newPart.memory_type = part.memory_type
            newPart.memory_gen = part.memory_gen
            if(part.mem_rank)
                newPart.mem_rank = part.mem_rank
            break
        case "CPU":
            if(part.frequency)
                newPart.frequency = part.frequency
            newPart.socket = part.socket
            break
        case "Motherboard":
            newPart.memory_gen = part.memory_gen
            if(part.chipset)
                newPart.chipset = part.chipset
            newPart.socket = part.socket
            break
        case "Peripheral Card":
	    newPart.mainboard_con = part.mainboard_con
            newPart.peripheral_type = part.peripheral_type
            newPart.num_ports = part.num_ports
	    if(part.port_type)
            	newPart.port_type = part.port_type
            break
        case "Storage":
            newPart.storage_type = part.storage_type
            newPart.storage_interface = part.storage_interface
            newPart.size = part.size
            newPart.capacity = part.capacity
            newPart.capacity_unit = part.capacity_unit
        case "Backplane":
            newPart.port_type = part.port_type
            newPart.num_ports = part.num_ports
            break;
        case "Cable":
            newPart.cable_end1 = part.cable_end1
            newPart.cable_end2 = part.cable_end2
            newPart.consumable = part.consumable
            break                
        case "Heatsink":
            newPart.socket = part.socket
            newPart.size = part.size
            newPart.active = part.active
            break;
        case "Optic":
            newPart.cable_end1 = part.cable_end1;
            newPart.consumable = part.consumable ? true : false
            break;
        default:
            newPart.consumable = part.consumable ? true : false
            break;
    }
    
    return objectSanitize(newPart, false) as PartSchema
}

export async function getKiosksAsync(building: number) {
    return await User.find({roles: 'is_kiosk', building: building}) as UserSchema[]
}

export async function getKioskNamesAsync(building: number) {
    let kioskUsers = await getKiosksAsync(building)
    return kioskUsers.map((k)=>k.first_name + " " + k.last_name);
}

export async function getAllKiosksAsync() {
    return await User.find({roles: 'is_kiosk'}) as UserSchema[]
}

export async function getAllKioskNames() {
    let kioskUsers = await getAllKiosksAsync()
    return kioskUsers.map((k)=>k.first_name + " " + k.last_name);
}

export function isValidPartID(id: string|undefined) {
    if(!id)
        id = ""
    return /PNX([0-9]{7})+/.test(id)
}


export function combineAndRemoveDuplicateCartItems(cartItems: CartItem[]) {
    // Initialize working variables
    let unserialized = new Map<string, number>()
    let serialized = new Map<string, Set<string>>()
    // For every cart item
    cartItems.map((item: CartItem) => {
        // If it has serial
        if(item.serial) {
            // Check if already in map
            if(serialized.has(item.nxid)) {
                // Get set of serials
                let set = serialized.get(item.nxid)
                // add serial
                set?.add(item.serial)
            } else {
                // Create new set
                let set = new Set<string>()
                // Add serial
                set.add(item.serial)
                // Add to mapgit push --set-upstream origin palletUpdate
                serialized.set(item.nxid, set)
            }
        }
        // If unserialized
        if(item.quantity)
            // Ternary checks if part is already in map, and adds quantities if so
            unserialized.set(item.nxid, unserialized.has(item.nxid)?unserialized.get(item.nxid)!+item.quantity:item.quantity)
    })
    // Init return variable
    let returnValue = [] as CartItem[]
    // Push map to array
    unserialized.forEach((val, key)=>{
        returnValue.push({nxid: key, quantity: val})
    })
    // Push serialized items to array
    serialized.forEach((val, key)=>{
        // For each serial in set
        val.forEach((serial)=>{
            returnValue.push({nxid: key, serial})
        })
    })
    return returnValue
}

export function sanitizeCartItems(cartItems: CartItem[]) {
    return combineAndRemoveDuplicateCartItems(cartItems
        .filter((item)=>item.nxid&&(item.serial||item.quantity))
        .map((item)=>{
            if(item.serial)
                return { nxid: item.nxid, serial: item.serial }
            return { nxid: item.nxid, quantity: item.quantity }
        }))
}

export function sanitizeInventoryEntry(entry: InventoryEntry) {
    let sanitized = {} as InventoryEntry
    // Check if valid part ID
    if(isValidPartID(entry.nxid))
        sanitized.nxid = entry.nxid
    else
        sanitized.nxid = ""
    // Check if valid array
    if(Array.isArray(entry.serials))
        sanitized.serials = entry.serials
    else
        sanitized.serials = []
    // Check if valid array
    if(Array.isArray(entry.newSerials))
        sanitized.newSerials = entry.newSerials
    else
        sanitized.newSerials = []
    // Check if valid number
    if(isNaN(entry.unserialized))
        sanitized.unserialized = 0
    else
        sanitized.unserialized = entry.unserialized
    // Return sanitized object
    return sanitized
}

export function sanitizeInventoryEntries(invEntries: InventoryEntry[]) {
    return invEntries
    // Sanitize each remaining item
    .map((item) => {
        return sanitizeInventoryEntry(item)
    })
    // Remove duplicates and empty nxids
    .filter((item, index, arr)=>{
        return (index == arr.findIndex((val)=>val.nxid==item.nxid)&&item.nxid!='')
    })
}

export async function inventoryEntriesValidAsync(invEntries: InventoryEntry[]) {
    // Run all requests concurrently
    let valid = true
    await Promise.all(invEntries.map(async (item)=>{
        let part = await Part.findOne({nxid: item.nxid}) as PartSchema
        if(
            !part
            // Make sure item does not have quantity AND serial
            ||!Array.isArray(item.serials)
            // Make sure quantity is a number
            ||isNaN(item.unserialized)
            // Make sure serial is string and not empty
            ||!Array.isArray(item.newSerials)
            // Make sure serialized parts have serial and unserialized do not
        ) {
            valid = false
        }
    }))
    return valid
}

export async function cartItemsValidAsync(cartItems: CartItem[]) {
    // Run all requests concurrently
    let valid = true
    await Promise.all(cartItems.map(async (item)=>{
        let part = await Part.findOne({nxid: item.nxid}) as PartSchema
        if(
            !part||
            // Make sure item does not have quantity AND serial
            !((item.serial&&!item.quantity)||(!item.serial&&item.quantity))
            // Make sure quantity is a number
            ||(item.quantity&&isNaN(item.quantity))
            // Make sure serial is string and not empty
            ||(item.serial&&(typeof(item.serial)!="string"||item.serial==""))
            // Make sure serialized parts have serial and unserialized do not
            // Old:
            //||((part.serialized==true&&!item.serial)||(part.serialized==false&&item.serial))
            // New:
            ||(part.serialized==false&&item.serial)
        ) {
            valid = false
        }
    }))
    return valid
}

export async function kioskHasInInventoryAsync(kioskName: string, building: number, inventory: CartItem[]) {
    // Filter out the part IDs
    let nxids = inventory.map((i)=>i.nxid).filter((i, index, arr)=>arr.indexOf(i)==index)
    // Find the parts
    return PartRecord.find({nxid: { $in: nxids }, location: kioskName, next: null, building})
        .then((userInventoryRecords: PartRecordSchema[])=>{
            let { added, error } = getAddedAndRemovedIgnoreSerials(inventory, userInventoryRecords)
            // If function encounters error
            if(error)
                return false
            // If added has no members, we can assume the user has all the parts listed in their inventory
            return added.length==0
        })
        .catch(()=>{
            return false
        })
}


export function getPartSearchRegex(searchString: string) {
    let keywords = [searchString]
    keywords = keywords.concat(searchString.split(" ")).filter((s)=>s!='')
    let searchOptions = [] as any
    let relevanceConditions = [] as any
    // Add regex of keywords to all search options
    keywords.map((key) => {
        // Why was this even here to begin with?
        searchOptions.push({ "nxid": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$nxid", regex: new RegExp(key, "") } }, 3, 0] })
        searchOptions.push({ "name": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$name", regex: new RegExp(key, "i") } }, 5, -1] })
        searchOptions.push({ "manufacturer": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$manufacturer", regex: new RegExp(key, "i") } }, 5, -1] })
        searchOptions.push({ "type": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$type", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "shelf_location": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$shelf_location", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "storage_interface": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$storage_interface", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "port_type": { $regex: key, $options: "i" } })
        // REGEX doesn't allow arrays
        // relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$port_type", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "peripheral_type": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$peripheral_type", regex: new RegExp(key, "i") } }, 2, 0] })
        searchOptions.push({ "memory_type": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$memory_type", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "memory_gen": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$memory_gen", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "frequency": { $regex: key, $options: "i" } })
        // REGEX doesn't allow numbers
        // relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$frequency", regex: new RegExp(key, "i") } }, 2, 0] })
        searchOptions.push({ "size": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$size", regex: new RegExp(key, "i") } }, 2, 0] })
        searchOptions.push({ "cable_end1": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$cable_end1", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "cable_end2": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$cable_end2", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "chipset": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$chipset", regex: new RegExp(key, "i") } }, 1, 0] })
        searchOptions.push({ "socket": { $regex: key, $options: "i" } })
        // REGEX doesn't allow arrays
        // relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$socket", regex: new RegExp(key, "i") } }, 1, 0] })
    })
    return { regexKeywords: searchOptions, relevanceScore: relevanceConditions }
}

export function returnPartSearch(numPages: number, numParts: number, req: Request, res: Response) {
    // Return mongoose callback
    return async (err: CallbackError | null, parts: PartSchema[])  => {
        if (err) {
            // Database err
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
        // Map for all parts
        let kioskNames = [] as string[]
        let user = await User.findById(req.user.user_id)
        if(user&&user.roles?.includes("is_kiosk")) {
            let u = await User.findById(req.user.user_id)
            kioskNames.push(u?.first_name + " " + u?.last_name)
        }
        else {
            kioskNames =  await getKioskNamesAsync(req.user.building)
        }
        let { building, location } = req.query;
        // Get a list of nxids
        let nxids = [] as string[]
        // For is quicker than map supposedly
        for (let i = 0; i < parts.length; i++) {
            nxids.push(parts[i].nxid!)
        }
        // Count kiosk quantities using aggregate pipeline
        let counts = await PartRecord.aggregate([
            {
                $match:{
                    nxid: { $in: nxids },
                    next: null,
                    // This will enable build kits counting towards search quantities
                    // $or: [
                    //     {
                    //         location: location ? location : { $in: kioskNames }
                    //     },
                    //     // Evil ternary shit
                    //     (req.user.roles.includes('kiosk') ?
                    //         // If User is a kiosk
                    //         {
                    //             location: 'Build Kit',
                    //             kiosk: req.user.user_id
                    //         }
                    //         :
                    //         // If User is not a kiosk
                    //         {
                    //             location: 'Build Kit'
                    //         }
                    //     )
                    // ],
                    location: location ? location : {$in: kioskNames},
                    building: isNaN(parseInt(building as string)) ? req.user.building : parseInt(building as string)
                }
            },
            {
                $group: {
                    _id: "$nxid",
                    quantity: {$sum: 1}
                }
            }
        ]) as PartSchema[]
        // Initialize hashmap
        let countsMap = new Map<string, number>()
        // Push parts to map
        for (let i = 0; i < counts.length; i++) {
            countsMap.set(counts[i]._id, counts[i].quantity!)
        }
        // Get total counts
        let totalCounts = await PartRecord.aggregate([
            {
                $match:{
                    nxid: { $in: nxids },
                    next: null
                }
            },
            {
                $group: {
                    _id: "$nxid",
                    quantity: {$sum: 1}
                }
            }
        ]) as PartSchema[]
        // Create map
        let totalCountsMap = new Map<string, number>()
        // Push quantities to map
        for (let i = 0; i < totalCounts.length; i++) {
            totalCountsMap.set(totalCounts[i]._id, totalCounts[i].quantity!)
        }
        // Add total quantities and quanities to parts
        let returnParts = parts.map((p)=>{
            let part = JSON.parse(JSON.stringify(p))
            part.quantity = countsMap.has(p.nxid!)?countsMap.get(p.nxid!):0
            part.total_quantity = totalCountsMap.has(p.nxid!)?totalCountsMap.get(p.nxid!):0
            return part
        })
        // Return
        return res.status(200).json({ pages: numPages, total: numParts, items: returnParts});
    }
}

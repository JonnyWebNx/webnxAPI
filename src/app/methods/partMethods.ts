import { PartQuery, CartItem, PartSchema, PartRecordSchema } from "../interfaces.js"
import { CallbackError } from "mongoose"
import Part from "../../model/part.js"
import { getAddedAndRemoved } from "./assetMethods.js"
import PartRecord from "../../model/partRecord.js"

export function objectToRegex(obj: any) {
    let regexObject = {} as PartQuery
    Object.keys(obj).forEach((k)=>{
        // early return for empty strings
        if(obj[k]=='')
            return
        // ALlow array partial matches
        if(Array.isArray(obj[k])&&!(obj[k]!.length==0)) {
            // Generate regex for each array field
            let arr = (obj[k] as string[]).map((v)=>{
                return new RegExp(v, "i") 
            })
            // Use $all with array of case insensitive regexes
            return regexObject[k] = { $all: arr }
        }
        // Check if value is integer
        if(typeof(obj[k])=='string'&&!isNaN(obj[k] as any)) {
            // Parse integer
            return regexObject[k] = parseFloat(obj[k] as string)
        }
        // Check if not boolean 
        if(!(obj[k]=='true')&&!(obj[k]=='false'))
            // Create case insensitive regex
            return regexObject[k] = { $regex: obj[k], $options: 'i' } 
        // Any value here is likely a boolean
        regexObject[k] = obj[k]
    })
    return regexObject
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

export function cartItemsValid(cartItems: CartItem[]) {
    return new Promise<boolean>(async (res)=>{
        // Run all requests concurrently
        let valid = true
        await Promise.all(cartItems.map((item)=>{
            return new Promise<void>(async (resolve)=>{
                let part = await Part.findOne({nxid: item.nxid}) as PartSchema
                if(
                    !part||
                    // Make sure item does not have quantity AND serial
                    !((item.serial&&!item.quantity)||(!item.serial&&item.quantity))
                    // Make sure quantity is a number
                    ||(item.quantity&&isNaN(item.quantity))
                    // Make sure serial is string and not empty
                    ||(item.serial&&(typeof(item.serial)!="string"&&typeof(item.serial)!="string")&&item.serial!="")
                    // Make sure serialized parts have serial and unserialized do not
                    ||((part.serialized&&!part.serial)||(!part.serialized&&part.serial))
                ) {
                    valid = false
                }
                resolve()
            })
        }))
        res(valid)
    })
}

/**
 *
 * @TODO OPTIMIZE!!!!
 *
 */
export function kioskHasInInventory(kioskName: string, building: number, inventory: CartItem[]) {
    return new Promise<boolean>((res)=>{
        let nxids = inventory.map((i)=>i.nxid).filter((i, index, arr)=>arr.indexOf(i)==index)
        PartRecord.find({nxid: { $in: nxids }, location: kioskName, next: null, building}, (err: CallbackError, userInventoryRecords: PartRecordSchema[])=>{
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

import { Response } from "express"
import { CallbackError, MongooseError } from "mongoose"
import handleError from "../util/handleError.js"
import { objectSanitize } from "../util/sanitize.js"
import PartRecord from "../model/partRecord.js"
import { BoxEvent, BoxSchema, CartItem, PartRecordSchema } from "../interfaces.js"
import Box from "../model/box.js"
import { getAddedAndRemovedWithNewSerials } from "./assetMethods.js"

export function isValidBoxTag(id: string) {
    return /BOX([0-9]{7})+/.test(id)
}

export function cleanseBox(box: BoxSchema) {
    let newBox = {
        box_tag: box.box_tag,
        location: box.location,
        building: box.building,
        notes: box.notes,
        by: box.by,
        date_created: box.date_created,
        next: box.next,
        prev: box.prev
    }
    return objectSanitize(newBox, false) as BoxSchema
}

export function returnBox(res: Response) {
    return (err: MongooseError, box: BoxSchema) => {
        if(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
        return res.status(200).json(box)
    }
}

export function returnBoxSearch(res: Response, numPages: number, numBoxes: number) {
    return (err: CallbackError | null, boxes: BoxSchema[])  => {
        if (err) {
            // Database err
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
        return res.status(200).json({pages: numPages, total: numBoxes, items: boxes});
    }
}

export function getBoxSearchRegex(searchString: string) {
    let keywords = [searchString]
    keywords = keywords.concat(searchString.split(" ")).filter((s)=>s!='')
    let searchOptions = [] as any
    let relevanceConditions = [] as any
    // Add regex of keywords to all search options
    keywords.map((key) => {
        searchOptions.push({ "box_tag": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$box_tag", regex: new RegExp(key, "i") } }, 3, 0] })
        searchOptions.push({ "location": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$location", regex: new RegExp(key, "i") } }, 3, 0] })
        searchOptions.push({ "notes": { $regex: key, $options: "is" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$notes", regex: new RegExp(key, "i") } }, 1, 0] })
    })
    return { regexKeywords: searchOptions, relevanceScore: relevanceConditions }
}

export function boxesAreSimilar(box1: BoxSchema, box2: BoxSchema) {
    let copy1 = JSON.parse(JSON.stringify(box1))
    let copy2 = JSON.parse(JSON.stringify(box2))
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

export async function getBoxUpdateDates(box_tag: string) {
    let dates = [] as Date[]
    // Get all the dates of asset related events
    dates = dates.concat(await PartRecord.find({box_tag}).distinct("date_created") as Date[])
    dates = dates.concat(await PartRecord.find({box_tag}).distinct("date_replaced") as Date[])
    dates = dates.concat(await Box.find({box_tag}).distinct("date_created") as Date[])
    dates = dates.concat(await Box.find({box_tag}).distinct("date_replaced") as Date[])
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

export function getAddedPartsBox(box_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                box_tag,
                date_created: date,
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

export function getRemovedPartsBox(box_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                box_tag,
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
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export function getExistingPartsBox(box_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                box_tag,
                date_created: { $lt: date },
                $or: [
                    { date_replaced: null }, 
                    { date_replaced: { $gt: date } },
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

export async function getBoxEvent(box_tag: string, date: Date, nxids?: string[]) {
    try {
        // Get part info
        let addedParts = await getAddedPartsBox(box_tag, date, nxids)
        let removedParts = await getRemovedPartsBox(box_tag, date, nxids)
        let existingParts = await getExistingPartsBox(box_tag, date, nxids)
        let by = ""
        // Get current box
        let box = await Box.findOne({box_tag, date_created: { $lte: date }, $or: [
            { date_replaced: { $gt: date } },
            { date_replaced: null },
        ]})
        if(box==null)
            box = await Box.findOne({box_tag, date_created: { $lte: date }, $or:[
                {next: null},
                {next:"deleted"}
            ]})
        // If box was updated
        if(box&&date.getTime()==box.date_created.getTime())
            by = box.by

        let added = [] as CartItem[]
        // Remap removed parts, find by attribute
        if(Array.isArray(addedParts))
            for(let i = 0; i < addedParts.length; i++) {
                if(by==""&&addedParts[i].by)
                    by = addedParts[i].by
                added.push({nxid: addedParts[i].nxid, serial: addedParts[i].serial, quantity: addedParts[i].quantity } as CartItem)
            }
        let removed = [] as CartItem[]
        // Remap removed parts, find by attribute
        if(Array.isArray(removedParts))
            for(let i = 0; i < removedParts.length; i++) {
                if(by==""&&removedParts[i].next_owner)
                    by = removedParts[i].next_owner
                removed.push({ nxid: removedParts[i].nxid, serial: removedParts[i].serial, quantity: removedParts[i].quantity } as CartItem)
            }
        // Fallback
        if(by==""&&box)
            by = box.by
        return { 
            date_begin: date, 
            box_id: box!._id, 
            info_updated: (box!.date_created!.getTime() == date.getTime()), 
            existingParts: existingParts as CartItem[], 
            addedParts: added, 
            removedParts: removed, 
            by: by 
        } as BoxEvent
    }
    catch(err) {
        console.log(box_tag)
        console.log(date)
        throw(err)
    }
}

export function returnBoxHistory(pageNum: number, pageSize: number, res: Response) {
    return async (err: CallbackError, box: BoxSchema) => {
        if (err)
            return res.status(500).send("API could not handle your request: " + err);

        let dates = await getBoxUpdateDates(box.box_tag!)
        let pageSkip = pageSize * (pageNum - 1)
        let totalEvents = dates.length
        
        dates = dates
            .splice(pageSkip, pageSize)
        // Get history
        let history = await Promise.all(dates.map((d)=>{
            return getBoxEvent(box.box_tag!, d)
        }))
        let pages = Math.ceil(totalEvents/pageSize)
        // Return to client
        res.status(200).json({total: totalEvents, pages, events: history})
    }
}


export async function boxHasInInventoryAsync(box_tag: string, building: number, inventory: CartItem[]) {
    // Filter out the part IDs
    let nxids = inventory.map((i)=>i.nxid).filter((i, index, arr)=>arr.indexOf(i)==index)
    // Find the parts
    return PartRecord.find({nxid: { $in: nxids }, box_tag, next: null, building})
        .then((userInventoryRecords: PartRecordSchema[])=>{
            let { added } = getAddedAndRemovedWithNewSerials(inventory, userInventoryRecords)
            // If added has no members, we can assume the box has all the parts listed.
            return added.length==0
        })
        .catch(()=>{
            return false
        })
}

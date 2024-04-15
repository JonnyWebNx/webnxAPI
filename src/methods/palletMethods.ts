import { Response } from "express"
import { CallbackError, MongooseError } from "mongoose"
import handleError from "../util/handleError.js"
import { objectSanitize } from "../util/sanitize.js"
import callbackHandler from "../util/callbackHandlers.js"
import Asset from "../model/asset.js"
import Pallet from "../model/pallet.js"
import PartRecord from "../model/partRecord.js"
import { AssetSchema, BoxSchema, CartItem, PalletEvent, PalletSchema } from "../interfaces.js"
import { isValidAssetTag } from "./assetMethods.js"
import { isValidBoxTag } from "./boxMethods.js"
import Box from "../model/box.js"

export function isValidPalletTag(id: string) {
    return /PAL([0-9]{5})+/.test(id)
}

export function isLocationValid(location: string) {
    return location && location != ""
}

export function cleansePallet(pallet: PalletSchema) {
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

export function returnPallet(res: Response) {
    return (err: MongooseError, pallet: PalletSchema) => {
        if(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
        return res.status(200).json(pallet)
    }
}

export function returnPalletSearch(res: Response, numPages: number, numPallets: number) {
    return (err: CallbackError | null, pallets: PalletSchema[])  => {
        if (err) {
            // Database err
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
        return res.status(200).json({pages: numPages, total: numPallets, items: pallets});
    }
}

export function getPalletSearchRegex(searchString: string) {
    let keywords = [searchString]
    keywords = keywords.concat(searchString.split(" ")).filter((s)=>s!='')
    let searchOptions = [] as any
    let relevanceConditions = [] as any
    // Add regex of keywords to all search options
    keywords.map((key) => {
        searchOptions.push({ "pallet_tag": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$pallet_tag", regex: new RegExp(key, "i") } }, 3, 0] })
        searchOptions.push({ "location": { $regex: key, $options: "i" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$location", regex: new RegExp(key, "i") } }, 3, 0] })
        searchOptions.push({ "notes": { $regex: key, $options: "is" } })
        relevanceConditions.push({ $cond: [{ $regexMatch: { input: "$notes", regex: new RegExp(key, "i") } }, 1, 0] })
    })
    return { regexKeywords: searchOptions, relevanceScore: relevanceConditions }
}

export function palletsAreSimilar(pallet1: PalletSchema, pallet2: PalletSchema) {
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

export async function getPalletUpdateDates(pallet_tag: string) {
    let dates = [] as Date[]
    // Get all the dates of asset related events
    dates = dates.concat(await PartRecord.find({pallet_tag}).distinct("date_created") as Date[])
    dates = dates.concat(await PartRecord.find({pallet_tag}).distinct("date_replaced") as Date[])
    dates = dates.concat(await Asset.find({pallet: pallet_tag, prevPallet: { $ne: pallet_tag }}).distinct("date_created") as Date[])
    dates = dates.concat(await Asset.find({pallet: pallet_tag, nextPallet: { $ne: pallet_tag }}).distinct("date_replaced") as Date[])
    dates = dates.concat(await Pallet.find({pallet_tag}).distinct("date_created") as Date[])
    dates = dates.concat(await Pallet.find({pallet_tag}).distinct("date_replaced") as Date[])
    dates = dates.concat(await Box.find({ location: pallet_tag, prev_location: { $ne: pallet_tag } }).distinct("date_created") as Date[])
    dates = dates.concat(await Box.find({ location: pallet_tag, prev_location: { $ne: pallet_tag } }).distinct("date_replaced") as Date[])
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

export function getAddedPartsPallet(pallet_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                pallet_tag,
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

export function getRemovedPartsPallet(pallet_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                pallet_tag,
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

export function getExistingPartsPallet(pallet_tag: string, date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                pallet_tag,
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

export function getAddedAssetsPallet(pallet_tag: string, date: Date) {
    return Asset.find({pallet: pallet_tag, date_created: date, prev_pallet: {$ne: pallet_tag} })
}

export function getRemovedAssetsPallet(pallet_tag: string, date: Date) {
    return Asset.find({pallet: pallet_tag, date_replaced: date, next_pallet: {$ne: pallet_tag} })
}

export function getExistingAssetsPallet(pallet_tag: string, date: Date) {
    return Asset.find({pallet: pallet_tag, date_created: { $lt: date }, $or: [
            {date_replaced: null}, 
            {date_replaced: { $gt: date }}
        ]
     })
}

export function getAddedBoxesPallet(pallet_tag: string, date: Date) {
    return Box.find({location: pallet_tag, date_created: date, prev_location: {$ne: pallet_tag} })
}

export function getRemovedBoxesPallet(pallet_tag: string, date: Date) {
    return Box.find({location: pallet_tag, date_replaced: date, next_location: {$ne: pallet_tag} })
}

export function getExistingBoxesPallet(pallet_tag: string, date: Date) {
    return Box.find({location: pallet_tag, date_created: { $lt: date }, $or: [
            {date_replaced: null}, 
            {date_replaced: { $gt: date }}
        ]
     })
}

export async function getPalletEvent(pallet_tag: string, date: Date, nxids?: string[]) {
    try {
        // Get part info
        let addedParts = await getAddedPartsPallet(pallet_tag, date, nxids)
        let removedParts = await getRemovedPartsPallet(pallet_tag, date, nxids)
        let existingParts = await getExistingPartsPallet(pallet_tag, date, nxids)
        // Get asset info
        let addedAssets = await getAddedAssetsPallet(pallet_tag, date) as AssetSchema[]
        let removedAssets = await getRemovedAssetsPallet(pallet_tag, date) as AssetSchema[]
        let existingAssets = await getExistingAssetsPallet(pallet_tag, date) as AssetSchema[]
        // Get box info
        let addedBoxes = await getAddedBoxesPallet(pallet_tag, date) as BoxSchema[]
        let removedBoxes = await getRemovedBoxesPallet(pallet_tag, date) as BoxSchema[]
        let existingBoxes = await getExistingBoxesPallet(pallet_tag, date) as BoxSchema[]
        let by = ""
        // Get current pallet
        let pallet = await Pallet.findOne({pallet_tag, date_created: { $lte: date }, $or: [
            { date_replaced: { $gt: date } },
            { date_replaced: null },
        ]})
        if(pallet==null)
            pallet = await Pallet.findOne({pallet_tag: pallet_tag, date_created: { $lte: date }, $or:[
                {next: null},
                {next:"deleted"}
            ]})
        // If pallet was updated
        if(pallet&&date.getTime()==pallet.date_created.getTime())
            by = pallet.by

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
        // Check assets for by
        if(Array.isArray(addedAssets)&&addedAssets.length>0&&by=="")
            for(let i = 0; i < addedAssets.length; i++) {
                if(by==""&&addedAssets[i].by)
                    by = addedAssets[i].by as string
                else if(by!="")
                    break
            }
        // Try to get by from removed assets
        if(Array.isArray(removedAssets)&&removedAssets.length>0&&by=="") {
            // Loop through all removed
            for (let i = 0; i < removedAssets.length; i++) {
                // Get next
                let removedAsset = await Asset.findById(removedAssets[i].next)
                // If exists and has by
                if(removedAsset&&removedAsset.by) {
                    // Copy by
                    by = removedAsset.by as string
                    // Break loop
                    break;
                }
            }
        }
        let addedAssetIDs = addedAssets.map((a: AssetSchema)=>a._id)
        let existingAssetIDs = existingAssets.map((a: AssetSchema)=>a._id)
        let removedAssetIDs = removedAssets.map((a: AssetSchema)=>a._id)

        let addedBoxIDs = addedBoxes.map((a: BoxSchema)=>a._id)
        let existingBoxIDs = existingBoxes.map((a: BoxSchema)=>a._id)
        let removedBoxIDs = removedBoxes.map((a: BoxSchema)=>a._id)
        // Fallback
        if(by==""&&pallet)
            by = pallet.by
        return { 
            date_begin: date, 
            pallet_id: pallet!._id, 
            info_updated: (pallet!.date_created!.getTime() == date.getTime()), 
            existingParts: existingParts as CartItem[], 
            addedParts: added, 
            removedParts: removed, 
            addedAssets: addedAssetIDs,
            removedAssets: removedAssetIDs,
            existingAssets: existingAssetIDs,
            addedBoxes: addedBoxIDs,
            removedBoxes: removedBoxIDs,
            existingBoxes: existingBoxIDs,
            by: by 
        } as PalletEvent
    }
    catch(err) {
        console.log(pallet_tag)
        console.log(date)
        throw(err)
    }
}
export function addAssetsToPallet(pallet_tag: string, asset_tags: string[], by: string, date: Date, building: number) {
    return Promise.all(asset_tags.map(async (a)=>{
        // Return if invalid asset tag
        if(!isValidAssetTag(a))
            return
        // Check if asset already exists
        let existingAsset = JSON.parse(JSON.stringify(await Asset.findOne({asset_tag: a, next: null}))) as AssetSchema
        // If asset already exists
        if(existingAsset) {
            existingAsset.prev = existingAsset._id
            delete existingAsset.date_updated
        }
        else {
            // Create new empty asset
            existingAsset = {
                asset_tag: a,
                prev: null,
                next: null,
                migrated: true
            } as AssetSchema
        }
        // Delete any locatin details
        delete existingAsset.public_port;
        delete existingAsset.private_port;
        delete existingAsset.ipmi_port;
        delete existingAsset.power_port;
        delete existingAsset.sid;
        delete existingAsset._id
        existingAsset.in_rack = false
        existingAsset.by = by
        // Copy pallet information
        existingAsset.building = building
        existingAsset.prev_pallet = existingAsset.pallet
        existingAsset.pallet = pallet_tag
        existingAsset.date_created = date
        if(existingAsset.prev!=null)
            Asset.create(existingAsset, callbackHandler.updateAsset)
        else
            Asset.create(existingAsset, callbackHandler.callbackHandleError)
    }))
}

export function addBoxesToPallet(pallet_tag: string, box_tags: string[], by: string, date: Date, building: number) {
    return Promise.all(box_tags.map(async (b)=>{
        // Return if invalid asset tag
        if(!isValidBoxTag(b))
            return
        // Check if asset already exists
        let existingBox = JSON.parse(JSON.stringify(await Box.findOne({box_tag: b, next: null}))) as BoxSchema
        // If asset already exists
        if(existingBox&&existingBox._id) {
            existingBox.prev = existingBox._id
        }
        else {
            // Create new empty asset
            existingBox = {
                box_tag: b,
                prev: null,
                next: null,
            } as BoxSchema
        }
        // Delete any locatin details
        delete existingBox._id
        existingBox.by = by
        // Copy pallet information
        existingBox.building = building
        existingBox.prev_location = existingBox.location
        existingBox.location = pallet_tag
        existingBox.date_created = date
        if(existingBox.prev!=null)
            Box.create(existingBox, callbackHandler.updateBox)
        else
            Box.create(existingBox, callbackHandler.callbackHandleError)
    }))
}

export function returnPalletHistory(pageNum: number, pageSize: number, res: Response) {
    return async (err: CallbackError, pallet: PalletSchema) => {
        if (err)
            return res.status(500).send("API could not handle your request: " + err);

        let dates = await getPalletUpdateDates(pallet.pallet_tag!)
        let pageSkip = pageSize * (pageNum - 1)
        let totalEvents = dates.length
        
        dates = dates
            .splice(pageSkip, pageSize)
        // Get history
        let history = await Promise.all(dates.map((d)=>{
            return getPalletEvent(pallet.pallet_tag!, d)
        }))
        let pages = Math.ceil(totalEvents/pageSize)
        // Return to client
        res.status(200).json({total: totalEvents, pages, events: history})
    }
}

export function parseAssetTags(tag_list: string) {
    let assets = tag_list && typeof(tag_list)=="string" ? tag_list as string : ""
    return assets.split('\n')
        // Filters out blank lines
        .filter((t: string) => t != '')
        // Gets rid of duplicates
        .filter((t: string, i: number, arr: string[]) => i == arr.indexOf(t))
        .map((t: string) => t.replace(/[, ]+/g, " ").trim())
        .filter((t: string)=>isValidAssetTag(t)) as string[];
}

export function parseBoxTags(tag_list: string) {
    let boxes = tag_list && typeof(tag_list)=="string" ? tag_list as string : ""
    return boxes.split('\n')
        // Filters out blank lines
        .filter((t: string) => t != '')
        // Gets rid of duplicates
        .filter((t: string, i: number, arr: string[]) => i == arr.indexOf(t))
        .map((t: string) => t.replace(/[, ]+/g, " ").trim())
        .filter((t: string)=>isValidBoxTag(t)) as string[];
}

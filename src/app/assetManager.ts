/**
* @author Cameron McKay
* 
* @email cameron@webnx.com
* 
* @brief Asset manager object for querying database and creating responses
* 
*/
import Asset from "../model/asset.js";
import PartRecord from "../model/partRecord.js";
import Part from "../model/part.js";
import handleError from "../config/handleError.js";
import callbackHandler from "../middleware/callbackHandlers.js";
import { Request, Response } from "express";
import { AssetEvent, AssetHistory, AssetSchema, CartItem, PartRecordSchema, PartSchema } from "./interfaces.js";
import mongoose, { CallbackError, MongooseError } from "mongoose";
import partRecord from "../model/partRecord.js";
import { stringSanitize, objectSanitize } from "../config/sanitize.js";

/**
 * 
 * @param parts 
 * @param asset_tag 
 * @param user_id 
 * @param building 
 * @param date 
 * @returns Promise object for awaits
 */
function createPartRecords(parts: CartItem[], asset_tag: string, user_id: any, building: number, date: number) {
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

function returnSearch(res: Response, numPages: number, numAssets: number) {
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
function cleanseAsset(asset: AssetSchema) {
    let copy = JSON.parse(JSON.stringify(asset)) as AssetSchema
    copy.asset_tag = copy.asset_tag ? copy.asset_tag.toUpperCase() : ""
    switch(copy.asset_type) {
        case "PDU":
        case "Switch":
            delete copy.public_port;
            delete copy.private_port;
            delete copy.ipmi_port;
            delete copy.sid;
            delete copy.units;
            delete copy.num_psu;
            delete copy.psu_model;
            delete copy.rails;
            delete copy.in_rack;
            delete copy.parent;
            if(copy.live) {
                delete copy.pallet
            }
            else {
                delete copy.power_port
            }
            break;
        case "Server":
            // Remove location if no rails are present
            if(!copy.in_rack&&!copy.live) {
                delete copy.public_port;
                delete copy.private_port;
                delete copy.ipmi_port;
                delete copy.power_port;
            }
            else {
                delete copy.pallet
            }
            // Remove SID if not live
            if(!copy.live) {
                delete copy.sid;
            }
            if(copy.live) {
                delete copy.avail
            }
            if(copy.chassis_type!='Node')
                delete copy.parent;
            if(!copy.num_bays||copy.num_bays < 1)
                delete copy.bay_type
            if(!copy.num_psu||copy.num_psu<1)
                delete copy.psu_model
            delete copy.fw_rev
            break;
        case "Laptop":
        default:
            delete copy.rails;
            delete copy.in_rack;
            delete copy.live;
            delete copy.public_port;
            delete copy.private_port;
            delete copy.ipmi_port;
            delete copy.power_port;
            delete copy.sid;
            delete copy.units;
            delete copy.num_psu;
            delete copy.psu_model;
            delete copy.cheat;
            delete copy.parent;
            delete copy.avail;
            break;
    }
    return objectSanitize(copy, false);
}

/**
 * 
 * @param parts 
 * @returns Serial number of existing part.  Empty string if none is found
 */
async function findExistingSerial(parts: CartItem[]) {
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
    return existingSerial
}

/**
 * 
 * @param createOptions 
 * @param searchOptions 
 * @param arr 
 */
function updateParts(createOptions: PartRecordSchema, searchOptions: PartRecordSchema, arr: CartItem[], migrated: boolean) {
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
            if (!migrated) {
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
function assetsAreSimilar(asset1: AssetSchema, asset2: AssetSchema) {
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
function returnAssets(res: Response) {
    return (err: CallbackError, records: AssetSchema[]) => {
        if (err)
            res.status(500).send("API could not handle your request: " + err);
        else
            res.status(200).json(records);
    }
}

function returnAsset(res: Response) {
    return (err: CallbackError, record: AssetSchema) => {
        if (err)
            res.status(500).send("API could not handle your request: " + err);
        else
            res.status(200).json(record);
    }
}

export function getAssetEvent(asset_tag: string, d: Date) {
    return new Promise<AssetEvent>(async (res)=>{
        // Get parts removed from asset
        let added = await PartRecord.aggregate([
            {
                $match: { asset_tag: asset_tag, date_created: d }
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
        // Get parts added to asset
        let removed = await PartRecord.aggregate([
            {
                $match: { asset_tag: asset_tag, date_replaced: d }
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
        // Get parts already on asset
        let existing = await PartRecord.aggregate([
            {
                $match: { asset_tag: asset_tag, date_created: { $lt: d },date_replaced: { $gt: d }}
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
                $match: { asset_tag: asset_tag, date_created: { $lt: d },date_replaced: null }
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
        // Find current asset iteration
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
                if(by=="")
                    by = a.by
                return { nxid: a.nxid, serial: a.serial, quantity: a.quantity } as CartItem
            })
        let removedParts = [] as CartItem[]
        // Remap removed parts, find by attribute
        if(Array.isArray(removed))
            removedParts = removed.map((a)=>{
                if(by=="") {
                    by = a.next_owner
                }
                return { nxid: a.nxid, serial: a.serial, quantity: a.quantity } as CartItem
            })
        // If no by is found
        if(current_asset&&by=="")
            by = current_asset.by as string
        return res({ date_begin: d, asset_id: current_asset._id, info_updated: ((added.length==0&&removed.length==0)||current_asset.date_created!.getTime() == d.getTime()), existing: existing as CartItem[], added: addedParts, removed: removedParts, by: by } as AssetEvent)
    })
}
const assetManager = {
    addUntrackedAsset: async (req: Request, res: Response) => {
        try {
            // Get asset from request
            let asset = req.body.asset as AssetSchema
            let parts = req.body.parts as CartItem[]
            // Return if user is kiosk
            if(req.user.roles.includes("kiosk")) {

                return res.status(401).send("Kiosk cannot create assets")
            }
            // Check for required fields
            if (!(asset.asset_tag&&asset.asset_type)||!/WNX([0-9]{7})+/.test(asset.asset_tag)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            let existingAsset = await Asset.findOne({asset_tag: asset.asset_tag})
            if(existingAsset) {
                return res.status(400).send("Asset tag already in use");
            }
            // Remove date created if present
            delete asset.date_created;
            // Set by attribute to requesting user
            let dateCreated = Date.now()
            asset.by = req.user.user_id;
            asset.date_created = new Date(dateCreated);
            asset.date_updated = dateCreated;
            asset.prev = null;
            asset.next = null;
            delete asset.migrated;

            asset = cleanseAsset(asset)

            if(asset.parent&&asset.parent!='') {
                let parentChassis = await Asset.findOne({asset_tag: asset.parent, next: null})
                if(parentChassis==null)
                    return res.status(400).send(`Node chassis not found`);
            }

            // Set sentinel value
            let existingSerial = await findExistingSerial(parts)
            // If serial already exists, return error
            if(existingSerial!="")
                return res.status(400).send(`Serial number ${existingSerial} already in inventory`);
            
            // Create part records
            await createPartRecords(parts, asset.asset_tag!, req.user.user_id, asset.building!, dateCreated)
            // Create a new asset
            Asset.create(asset, returnAsset(res));
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    /**
     * 
     * @param req 
     * @param res 
     * @returns nothing
     */
    getAssets: async (req: Request, res: Response) => {
        try {
            // Clear unnecessary param
            if (req.query.advanced) {
                delete req.query.advanced;
            }
            if(!(req.query.pageSize&&req.query.pageNum))
                return res.status(400).send(`Missing page number or page size`);      
            let pageSize = parseInt(req.query.pageSize as string);
            let pageNum = parseInt(req.query.pageNum as string);
            delete req.query.pageNum
            delete req.query.pageSize
            // get object from request
            let asset = req.query as AssetSchema;
            asset.next = null;
            let numAssets = await Asset.count(asset)
            let numPages = numAssets%pageSize>0 ? Math.trunc(numAssets/pageSize) + 1 : Math.trunc(numAssets/pageSize)
            // Send request to database
            Asset.find(asset)
                .skip(pageSize * (pageNum - 1))
                .limit(Number(pageSize)+1)
                .exec(returnSearch(res, numPages, numAssets))
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    /**
     * 
     * @param req 
     * @param res 
     * @returns nothing
     */
    getAssetByID: async (req: Request, res: Response) => {
        try {
            // Get id from query
            let id = (req.query.id as string).toUpperCase()
            // Test regex for NXID
            if (/WNX([0-9]{7})+/.test(id)||id=='test') {
                // Find by NXID
                Asset.findOne({asset_tag: id, next: null}, returnAsset(res));
            }
            // If id is not NXID
            else {
                // Find by mongo ID
                Asset.findById(id, returnAsset(res));
            }
            
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    /**
     * 
     * @param req 
     * @param res 
     * @returns nothing
     */
    searchAssets: async (req: Request, res: Response) => {
        try {
            // Search data
            // Limit
            // Page number
            let { searchString, pageSize, pageNum } = req.query;
            let pageSizeInt = parseInt(pageSize as string)
            let pageNumInt = parseInt(pageNum as string)
            if(isNaN(pageSizeInt)||isNaN(pageNumInt))
                return res.status(400).send("Invalid page number or page size");
            let pageSkip = pageSizeInt * (pageNumInt - 1)
            if(typeof(searchString)!="string") {
                return res.status(400).send("Search string undefined");
            }
            // Find parts
            // Skip - gets requested page number
            // Limit - returns only enough elements to fill page

            // Split keywords from search string
            let fullText = false
            // Check if text search yields results            
            let ass = await Asset.findOne(searchString != ''? { $text: { $search: searchString } } : {})
            // Set fulltext if text search yields results
            if(ass!=undefined)
                fullText = true
            // Fulltext search
            if (fullText) {
                let numAssets = await Asset.count(searchString != ''? { $text: { $search: searchString } } : {}).where({next: null})
                // Ternary that hurts my eyes
                let numPages = numAssets%pageSizeInt>0 ? Math.trunc(numAssets/pageSizeInt) + 1 : Math.trunc(numAssets/pageSizeInt)

                Asset.find(searchString != ''? { $text: { $search: searchString } } : {})
                    .where({next: null})
                    .skip(pageSkip)
                    .limit(pageSizeInt+1)
                    .exec(returnSearch(res, numPages, numAssets))
            }
            else {
                // Keyword search
                let keywords = []
                keywords.push(searchString)
                keywords = keywords.concat(searchString.split(" "))
                // Use keywords to build search options
                let searchOptions = [] as any[]
                // Add regex of keywords to all search options
                keywords.map((key) => {
                    searchOptions.push({ "asset_tag": { $regex: key, $options: "is" } })
                    searchOptions.push({ "notes": { $regex: key, $options: "is" } })
                    searchOptions.push({ "manufacturer": { $regex: key, $options: "is" } })
                    searchOptions.push({ "asset_type": { $regex: key, $options: "is" } })
                    searchOptions.push({ "chassis_type": { $regex: key, $options: "is" } })
                    searchOptions.push({ "location": { $regex: key, $options: "is" } })
                    searchOptions.push({ "model": { $regex: key, $options: "is" } })
                    searchOptions.push({ "serial": { $regex: key, $options: "is" } })
                    searchOptions.push({ "power_port": { $regex: key, $options: "is" } })
                    searchOptions.push({ "public_port": { $regex: key, $options: "is" } })
                    searchOptions.push({ "private_port": { $regex: key, $options: "is" } })
                    searchOptions.push({ "ipmi_port": { $regex: key, $options: "is" } })
                })

                // Aggregate count
                let countQuery = await Asset.aggregate([{ $match: {
                    $and: [
                        { $or: searchOptions },
                        { next: null }
                    ]
                    
                        } 
                    }]).count("numAssets")
                // This is stupid but it works
                let numAssets = countQuery.length > 0&&countQuery[0].numAssets ? countQuery[0].numAssets : 0
                // Ternary that hurts my eyes
                let numPages = numAssets%pageSizeInt>0 ? Math.trunc(numAssets/pageSizeInt) + 1 : Math.trunc(numAssets/pageSizeInt)

                Asset.aggregate([{ $match: {
                    $and: [
                        { $or: searchOptions },
                        { next: null }
                    ]
                    
                        } 
                    }])
                    .skip(pageSkip)
                    .limit(pageSizeInt+1)
                    .exec(returnSearch(res, numPages, numAssets))
            }
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    updateAsset: async (req: Request, res: Response) => {
        try {
            // Get data from request body
            let { asset, parts, correction } = req.body;
            // Check if asset is valid
            if (!/WNX([0-9]{7})+/.test(asset.asset_tag)||!(asset.asset_tag&&asset.asset_type)) {
                // Send response if request is invalid
                return res.status(400).send("Invalid request");
            }
            // Save current time for updates
            let current_date = Date.now();
            asset = asset as AssetSchema
            // Prep asset for updates
            asset.by = req.user.user_id;
            asset.date_updated = current_date;
            asset = cleanseAsset(asset)
            // Check if node parent chassis exists
            if(asset.parent&&asset.parent!='') {
                let parentChassis = await Asset.findOne({asset_tag: asset.parent, next: null})
                if(parentChassis==null)
                    return res.status(400).send(`Node chassis not found`);
            }
            // Create sentinel value
            let isMigrated = false
            // Find an existing asset
            let existingAsset = await Asset.findOne({asset_tag: asset.asset_tag, next: null})
            // Check if existing asset is null
            if(existingAsset==null) {
                // Return error
                return res.status(400).send("Could not find asset to update");
            }
            // If asset is marked as migrated
            if(asset.migrated) {
                // Set sentinel value
                isMigrated = true
                // Check if existing asset was already migrated
                if(!existingAsset.migrated)
                    // Return error
                    return res.status(400).send("Asset has already been migrated");
            }
            // Delete migrated data
            delete asset.migrated
            delete asset.old_by
            // Get part records that are currently on asset
            let existingParts = await PartRecord.find({
                asset_tag: asset.asset_tag, 
                next: null
            })
            // Store existing parts in a more usable format
            let unserializedPartsOnAsset = new Map<string, number>();
            let serializedPartsOnAsset = [] as CartItem[];
            let unserializedPartsOnRequest = new Map<string, number>();
            let serializedPartsOnRequest = [] as CartItem[];
            // Map existing records to usable data types
            existingParts.map((p)=>{
                // If part is serialized
                if(p.serial) {
                    // Push to array
                    return serializedPartsOnAsset.push({ nxid: p.nxid, serial: p.serial } as CartItem);
                }
                // Update map, if map has a number increment or start value at 1 
                return unserializedPartsOnAsset.set(p.nxid!, unserializedPartsOnAsset.has(p.nxid!) ? unserializedPartsOnAsset.get(p.nxid!)!+1 : 1);
            })
            let reqError = false
            // Map parts from request 
            parts.map((p: CartItem)=>{
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
                // Return error
                return res.status(400).send("Parts missing serial or quantity");
            // Parts removed from asset
            let removed = [] as CartItem[]
            // Parts added to asset
            let added = [] as CartItem[]
            // Check for serialized parts removed from asset
            function checkDifferenceSerialized(array1: CartItem[], array2: CartItem[], differenceDest: CartItem[]) {
                array1.map((p)=>{
                    let existing = array2.find((e)=>(p.nxid==e.nxid)&&(p.serial==e.serial));
                    if(!existing)
                        differenceDest.push(p)
                })
            }

            // Check for removed serialized parts
            checkDifferenceSerialized(serializedPartsOnAsset, serializedPartsOnRequest, removed)
            // Check for added serialized parts
            checkDifferenceSerialized(serializedPartsOnRequest, serializedPartsOnAsset, added)
            
            function checkDifferenceUnserialized(map1: Map<string, number>, map2: Map<string, number>, differenceDest: CartItem[]) {
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

            // Check for removed unserialized parts
            checkDifferenceUnserialized(unserializedPartsOnAsset, unserializedPartsOnRequest, removed)
            // Check for added unserialized parts
            checkDifferenceUnserialized(unserializedPartsOnRequest, unserializedPartsOnAsset, added)
            
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
            // Mark removed parts as deleted
            if(correction) {
                delete removedOptions.owner
                removedOptions.location = 'deleted'
                removedOptions.next = 'deleted'
            }
            // Update removed parts
            await updateParts(removedOptions, assetSearchOptions, removed, isMigrated)
            // Create new part records for added parts
            if(correction)
                isMigrated = true
            // Update added parts
            await updateParts(addedOptions, userSearchOptions, added, isMigrated)
    
            // Update the asset object and return to user before updating parts records
            let getAsset = JSON.parse(JSON.stringify(await Asset.findOne({asset_tag: asset.asset_tag, next: null}))) as AssetSchema
            
            // Check if assets are similar
            if(!assetsAreSimilar(asset, getAsset)) {
                // Assets are not similar
                delete asset._id
                asset.prev = getAsset._id
                asset.date_created = current_date
                asset.by = req.user.user_id
                delete asset.date_updated
                // Create new asset
                Asset.create(asset, (err: CallbackError, new_asset: AssetSchema) => {
                    if (err) {
                        handleError(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    // Update old asset
                    Asset.findByIdAndUpdate(new_asset.prev, { next: new_asset._id, date_replaced: current_date }, returnAsset(res))
                })
            }
            else {
                // Assets are similar
                // Check if parts were added or removed
                if(added.length>0||removed.length>0) {
                    // If parts were added or removed, set date_updated to current date
                    await Asset.findByIdAndUpdate(asset._id, { date_updated: current_date })
                    asset.date_updated = current_date
                }
                // Return asset
                res.status(200).json(asset)
            }
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    getPartsOnAsset: async (req: Request, res: Response) => {
        try {
            const { asset_tag } = req.query
            // Find all parts records associated with asset tag
            PartRecord.find({asset_tag, next: null}, async (err: CallbackError, records: PartRecordSchema[]) => {
                // If mongoose returns error
                if (err) {
                    // Handle error
                    handleError(err)
                    // Return to client
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Map for caching part info
                let cachedRecords = new Map<string, PartSchema>();
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
                await Promise.all(cartItems.map(async (item) =>{
                    // Check if part is cached
                    if (!cachedRecords.has(item.nxid)) {
                        // Set temp value
                        cachedRecords.set(item.nxid, {})
                        // Find part
                        let part = await Part.findOne({nxid: item.nxid})
                        // Check if exists
                        if(part) {
                            // If part was found, add to cache
                            cachedRecords.set(item.nxid, part)
                        }
                        else {
                            // Part not found, remove temp value from cache
                            cachedRecords.delete(item.nxid)
                        }
                    }
                }))
                // Convert map into array of objects
                let parts = Array.from(cachedRecords, (record) => {
                    return { nxid: record[0], part: record[1]}
                })
                // Return to client
                res.status(200).json({ parts: parts, records: cartItems})
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    deleteAsset: async (req: Request, res: Response) => {
        try {
            if(!req.user.roles.includes("admin"))
                return res.status(403).send("Only admin can delete assets.")
            const { asset_tag } = req.query
            // Find all parts records associated with asset tag
            let records = await PartRecord.find({ asset_tag, next: null,})   
            let current_date = Date.now()
            // Find all records associated with asset
            await Promise.all(records.map(async (record) => {
                // Mark as deleted
                await partRecord.findByIdAndUpdate(record._id, {next: "deleted"})
            }))
            // Find asset
            Asset.findOne({asset_tag, next: null}, (err: CallbackError, asset: AssetSchema) => {
                if(err) {
                    res.status(500).send("API could not handle your request: "+err);
                    return;
                }
                asset.prev = asset._id
                asset.next = "deleted"
                asset.date_created = new Date(current_date)
                delete asset._id
                // Create new iteration of asset
                Asset.create(asset, (err: CallbackError, new_asset: AssetSchema) => {
                    if(err) {
                        res.status(500).send("API could not handle your request: "+err);
                        return;
                    }
                    // Update old iteration
                    Asset.findByIdAndUpdate(new_asset.prev, { next: new_asset._id}, (err: CallbackError, new_asset: AssetSchema) => {
                        if(err) {
                            res.status(500).send("API could not handle your request: "+err);
                            return;
                        }
                        // All done
                        res.status(200).send("Success")
                    })
                })
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    getAssetHistory: async (req: Request, res: Response) => {
        try {
            function aggregationHistory(pageNum: number, pageSize: number){
                return async (err: CallbackError, asset: AssetSchema) => {
                    if (err) {
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    let dates = [] as Date[]
                    // Get all the dates of asset related events
                    dates = dates.concat(await PartRecord.find({asset_tag: asset.asset_tag}).distinct("date_created") as Date[])
                    dates = dates.concat(await PartRecord.find({asset_tag: asset.asset_tag}).distinct("date_replaced") as Date[])
                    dates = dates.concat(await Asset.find({asset_tag: asset.asset_tag}).distinct("date_created") as Date[])
                    dates = dates.concat(await Asset.find({asset_tag: asset.asset_tag}).distinct("date_replaced") as Date[])
                    // Get rid of duplicates
                    // Sort
                    dates = dates.sort((a: Date, b: Date) => { 
                        if (a < b)
                            return 1
                        return -1
                    })

                    let pageSkip = pageSize * (pageNum - 1)
                    // Get rid of duplicates
                    dates = dates
                        .filter((d)=>d!=null)
                        .map((d)=>d.getTime())
                        .filter((date, index, arr) => arr.indexOf(date) === index && date != null)
                        .map((d)=>new Date(d))

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
            // Get ID from query string
            let id = req.query.id as string
            let pageNum = parseInt(req.query.pageNum as string)
            let pageSize = parseInt(req.query.pageSize as string)
            if(isNaN(pageSize)||isNaN(pageNum))
                return res.status(400).send("Invalid page number or page size");
            // Check if ID is null or doesn't match ID type
            if (!id||!(/WNX([0-9]{7})+/.test(id)||mongoose.Types.ObjectId.isValid(id)))
                return res.status(400).send("Invalid request");
            // If NXID
            if (/WNX([0-9]{7})+/.test(id)) {
                Asset.findOne({asset_tag: id, next: null}, aggregationHistory(pageNum, pageSize))
            }
            // If mongo ID
            else {
                Asset.findById(id, aggregationHistory(pageNum, pageSize))
            }
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
};

export default assetManager

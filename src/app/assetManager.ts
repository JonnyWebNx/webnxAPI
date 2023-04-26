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
import handleError from "../config/mailer.js";
import callbackHandler from "../middleware/callbackHandlers.js";
import { Request, Response } from "express";
import { AssetEvent, AssetHistory, AssetSchema, CartItem, PartRecordSchema, PartSchema } from "./interfaces.js";
import mongoose, { CallbackError } from "mongoose";
import partRecord from "../model/partRecord.js";

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

/**
 * 
 * @param asset 
 * @returns Copy of asset with extra information removed
 */
function cleanseAsset(asset: AssetSchema) {
    let copy = JSON.parse(JSON.stringify(asset))
    switch(copy.asset_type) {
        case "Server":
            delete copy.public_port;
            delete copy.private_port;
            delete copy.ipmi_port;
            delete copy.power_port;
            delete copy.sid;
            break;
        case "Switch":
            delete copy.public_port;
            delete copy.private_port;
            delete copy.ipmi_port;
            delete copy.power_port;
            delete copy.sid;
            break;
        case "PDU":
            // Remove location if no rails are present
            if(!copy.in_rack||!copy.rails) {
                delete copy.public_port;
                delete copy.private_port;
                delete copy.ipmi_port;
                delete copy.power_port;
            }
            // Remove SID if not live
            if(!copy.live) {
                delete copy.sid;
            }
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
            break;
    }
    return copy;
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
 * @param map1 
 * @param map2 
 * @param differenceDest 
 */
function checkDifferenceUnserialized(map1: Map<string, number>, map2: Map<string, number>, differenceDest: CartItem[]) {
    map1.forEach((v,k)=>{
        if(map2.has(k)) {
            let reqQuantity = map2.get(k)!
            let difference = reqQuantity - v;
            if(difference > 0)
                differenceDest.push({nxid: k, quantity: difference})    
        }
        else {
            differenceDest.push({nxid: k, quantity: v})
        }
    })
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

const assetManager = {
    addMigratedAsset:async (req: Request, res: Response) => {
        try {
            // Get asset from body
            let asset = req.body as AssetSchema
            // Log it
            console.log(asset)
            // Set building
            asset.building = 3
            asset.migrated = true
            asset.date_created = asset.date_updated
            asset.by = '634e3e4a6c5d3490babcdc21'
            Asset.create(asset, (err: CallbackError, record: AssetSchema) => {
                if(err) {
                    handleError(err)
                    console.log(err)
                    return res.status(500).send("API could not handle your request: "+err);        
                }
                res.status(200).send()
            })
        }
        catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    addUntrackedAsset: async (req: Request, res: Response) => {
        try {
            // Get asset from request
            let asset = req.body.asset as AssetSchema
            let parts = req.body.parts as CartItem[]
            // Return if user is kiosk
            if(req.user.role=="kiosk") {

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
            asset.date_created = dateCreated;
            asset.date_updated = dateCreated;
            asset.prev = null;
            asset.next = null;
            delete asset.migrated;

            asset = cleanseAsset(asset)

            // Set sentinel value
            let existingSerial = await findExistingSerial(parts)
            // If serial already exists, return error
            if(existingSerial!="")
                return res.status(400).send(`Serial number ${existingSerial} already in inventory`);
            
            // Create part records
            await createPartRecords(parts, asset.asset_tag!, req.user.user_id, asset.building!, dateCreated)
            // Create a new asset
            Asset.create(asset, (err, record) => {
                if (err){
                    handleError(err)            
                    res.status(500).send("API could not handle your request: " + err);
                }
                else
                    res.status(200).json(record);
            });
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
            // get object from request
            let asset = req.query as AssetSchema;
            // Clear unnecessary param
            if (req.query.advanced) {
                delete req.query.advanced;
            }
            asset.next = null;
            // Send request to database
            Asset.find(asset, (err: CallbackError, record: PartRecordSchema) => {
                if (err)
                    res.status(500).send("API could not handle your request: " + err);
                else
                    res.status(200).json(record);
            });
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
            const id = req.query.id as string
            // Test regex for NXID
            if (/WNX([0-9]{7})+/.test(id)||id=='test') {
                // Find by NXID
                Asset.findOne({asset_tag: id, next: null}, (err: CallbackError, record: AssetSchema) => {
                    if (err)
                        res.status(500).send("API could not handle your request: " + err);
                    else
                        res.status(200).json(record);
                });
            }
            // If id is not NXID
            else {
                // Find by mongo ID
                Asset.findById(id, (err: CallbackError, record: AssetSchema) => {
                    if (err)
                        res.status(500).send("API could not handle your request: " + err);
                    else
                        res.status(200).json(record);
                });
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
            const searchString = req.query.searchString? req.query.searchString as string : ""
            const pageSize = req.query.pageSize? parseInt(req.query.pageSize as string) : 25
            const pageNum = req.query.pageNum? parseInt(req.query.pageNum as string) : 1
            // Find parts
            // Skip - gets requested page number
            // Limit - returns only enough elements to fill page

            // Split keywords from search string
            let keywords = searchString.split(" ")
            // Use keywords to build search options
            let searchOptions = [] as any[]
            // Add regex of keywords to all search options
            keywords.map((key) => {
                searchOptions.push({ "asset_tag": { $regex: key, $options: "is" } })
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
            Asset.aggregate([{ $match: {
                    $and: [
                        { $or: searchOptions },
                        { next: null }
                    ]
                    
                } 
            }])
            .skip(pageSize * (pageNum - 1))
            .limit(Number(pageSize)+1)
            .exec((err, record) => {
                if (err)
                    res.status(500).send("API could not handle your request: " + err);
                else
                    res.status(200).json(record);
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
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
            asset = asset as AssetSchema
            // Prep asset for updates
            asset.by = req.user.user_id;
            asset.date_updated = current_date;
            asset = cleanseAsset(asset)
            let isMigrated = false
            if(asset.migrated) {
                isMigrated = true
                let existingAsset = await Asset.findOne({asset_tag: asset.asset_tag, next: null})
                
                if(existingAsset!=undefined) {
                    if(!existingAsset.migrated)
                        return res.status(400).send("Asset has already been migrated");
                }
                else {
                    return res.status(400).send("Could not find migrated asset");
                }
            }
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
            // Map part records to new format
            
            existingParts.map((p)=>{
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
            parts.map((p: CartItem)=>{
                if(p.serial) {
                    // Push to array
                    serializedPartsOnRequest.push({ nxid: p.nxid, serial: p.serial });
                }
                else if (p.quantity) {
                    unserializedPartsOnRequest.set(p.nxid, p.quantity);
                }    
            })
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
            // Update removed parts
            await updateParts(removedOptions, assetSearchOptions, removed, isMigrated)
            // Update added parts
            await updateParts(addedOptions, userSearchOptions, added, isMigrated)
    
            // Update the asset object and return to user before updating parts records
            let getAsset = JSON.parse(JSON.stringify(await Asset.findOne({asset_tag: asset.asset_tag, next: null}))) as AssetSchema
            
            // Check if assets are similar
            if(!assetsAreSimilar(asset, getAsset)) {
                // Assets are not similar
                delete asset._id
                asset.prev = getAsset._id
                // Create new asset
                Asset.create(asset, (err: CallbackError, new_asset: AssetSchema) => {
                    if (err) {
                        handleError(err)
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    // Update old asset
                    Asset.findByIdAndUpdate(new_asset.prev, { next: new_asset._id, date_replaced: current_date }, (err: CallbackError, updated_asset: AssetSchema) => {
                        if (err) {
                            handleError(err)
                            return res.status(500).send("API could not handle your request: " + err);
                        }
                        // Return new asset
                        res.status(200).json(new_asset)
                    })
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
                if (err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
                let cachedRecords = new Map<string, PartSchema>();
                let unserializedParts = new Map<string, number>();
                let cartItems = [] as CartItem[]

                await Promise.all(records.map((record) => {
                    if(record.serial) {
                        cartItems.push({nxid: record.nxid!, serial: record.serial })
                    }
                    else if (unserializedParts.has(record.nxid!)) {
                        unserializedParts.set(record.nxid!, unserializedParts.get(record.nxid!)! + 1)
                    }
                    else {
                        unserializedParts.set(record.nxid!, 1)
                    }
                }))
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
                let parts = Array.from(cachedRecords, (record) => {
                    return { nxid: record[0], part: record[1]}
                })
                res.status(200).json({ parts: parts, records: cartItems})
            })
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    deleteAsset: async (req: Request, res: Response) => {
        try {
            if(req.user.role != "admin")
                return res.status(403).send("Only admin can delete assets.")
            const { asset_tag } = req.query
            // Find all parts records associated with asset tag
            let records = await PartRecord.find({ asset_tag, next: null,})   
            let current_date = Date.now()

            await Promise.all(records.map(async (record) => {
                let createOptions = {
                    nxid: record.nxid,
                    owner: "all",
                    building: req.user.building,
                    location: "All Techs",
                    by: req.user.user_id,
                    prev: record._id,
                    date_created: current_date,
                    next: null,
                } as PartRecordSchema
                await partRecord.findByIdAndUpdate(createOptions.prev, {next: "deleted"})
            }))
            Asset.findOne({asset_tag, next: null}, (err: CallbackError, asset: AssetSchema) => {
                if(err) {
                    res.status(500).send("API could not handle your request: "+err);
                    return;
                }
                asset.prev = asset._id
                asset.next = "deleted"
                asset.date_created = current_date
                delete asset._id
                Asset.create(asset, (err: CallbackError, new_asset: AssetSchema) => {
                    if(err) {
                        res.status(500).send("API could not handle your request: "+err);
                        return;
                    }
                    Asset.findByIdAndUpdate(new_asset.prev, { next: new_asset._id}, (err: CallbackError, new_asset: AssetSchema) => {
                        if(err) {
                            res.status(500).send("API could not handle your request: "+err);
                            return;
                        }
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
            let getHistory = async (err: CallbackError, asset: AssetSchema) => {
                try{

                    if (err) {
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                let dates = [] as string[]
                // Get all assets associated with NXID
                let allAssets = await Asset.find({asset_tag: asset.asset_tag})
                // Get all part records associated with NXID
                let allPartRecords = await PartRecord.find({asset_tag: asset.asset_tag})
                // Get all asset dates
                allAssets.map(async (thisAsset) => {
                    let date = thisAsset.date_created as Date
                    if((date!=null)&&(dates.indexOf(date.toISOString())<0))
                    dates.push(date.toISOString())
                })
                // Get all part add and remove dates
                allPartRecords.map(async (record) => {
                    // Get date created
                    let date = record.date_created as Date
                    // Check if date is already in array
                    if((date!=null)&&(dates.indexOf(date.toISOString())<0))
                    dates.push(date.toISOString())
                    // Get date replaced
                    date = record.date_replaced as Date
                    // Check if date is already in array
                    if((date!=null)&&(dates.indexOf(date.toISOString())<0))
                    dates.push(date.toISOString())
                })
                // Sort the dates
                dates = dates.sort((a: string, b: string) => { 
                    if (new Date(a)>new Date(b))
                    return 1
                    return -1
                })
                // Get rid of duplicates
                dates = dates.filter((date, index) => dates.indexOf(date) === index);
                // For each date find matching asset, added parts, and removed parts
                let history = await Promise.all(dates.map(async (updateDate, index, arr) => {
                    // Create date object
                    let by = ''
                    let dateObject = new Date(updateDate)
                    // Check for asset updates
                    let assetUpdate = allAssets.find(ass => ass.date_created! <= dateObject && dateObject < ass.date_replaced)
                    if(!assetUpdate) {
                        assetUpdate = allAssets.find(ass => ass.date_created! <= dateObject && ass.date_replaced == null)
                    }
                    let assetUpdated = assetUpdate?.date_created!.toISOString() == dateObject.toISOString()
                    // Check for parts that are already present
                    let tempExistingParts = await PartRecord.find({
                        asset_tag: asset.asset_tag, 
                        $and: [
                            {
                                date_created: {
                                    $lt: dateObject
                                }
                            },
                            {
                                $or: [
                                    {
                                        date_replaced: {
                                            $gt: dateObject
                                        }
                                    },
                                    {
                                        date_replaced: undefined
                                    },
                                    {
                                        date_replaced: null
                                    },
                                ]
                            }
                        ]
                    })
                    let existingParts = [] as CartItem[]
                    // Loop over every part already on asset
                    tempExistingParts.map((record) => {
                        // Check if part is already in array
                        if(record.serial) {
                            existingParts.push({nxid: record.nxid, serial: record.serial})
                        }
                        else {
                            let existingRecord = existingParts.find((rec => rec.nxid == record.nxid))
                            // If it exists, increment the quantity
                            if(existingRecord)
                            existingRecord.quantity! += 1
                            // If not, push a new object
                            else
                            existingParts.push({nxid: record.nxid, quantity: 1})
                        }
                    })
                    // Check if parts were added on this time
                    let addedParts = [] as CartItem[]
                    // Filter for added parts, and loop over all of them
                    allPartRecords.filter(record => record.date_created.toISOString() == updateDate).map((record) => {
                        if(by=='') {
                            by = record.by
                        }
                        // Check if part is already in array
                        if (record.serial) {
                            addedParts.push({nxid: record.nxid, serial: record.serial})
                        }
                        else {
                            let existingRecord = addedParts.find((rec => rec.nxid == record.nxid))
                            // If it exists, increment
                            if(existingRecord)
                            existingRecord.quantity! += 1
                            // If not, push a new object
                            else
                            addedParts.push({nxid: record.nxid, quantity: 1})
                        }
                    })
                    // Check if parts were removed
                    let removedParts = [] as CartItem[]
                    let tempRecordID = ''
                    // Filter for removed parts, and loop over all of them
                    allPartRecords.filter(record => (record.date_replaced!=undefined)&&(record.date_replaced.toISOString() == updateDate)).map((record) => {
                        if(by=='') {
                            tempRecordID = record.next
                        }
                        if(record.serial) {
                            removedParts.push({nxid: record.nxid, serial: record.serial})
                        }
                        else {
                            // Check if part is already in array
                            let existingRecord = removedParts.find((rec => rec.nxid == record.nxid))
                            // If it exists, increment
                            if(existingRecord)
                            existingRecord.quantity! += 1
                            // If not, push a new object
                            else
                            removedParts.push({nxid: record.nxid, quantity: 1})
                        }
                    })
                    // Get current date (will be returned if asset is most recent)
                    let nextDate = new Date(Date.now())
                    if(by==''&&tempRecordID!='') {
                        let test = await PartRecord.findById(tempRecordID)
                        if(test&&test.by)
                            by = test.by
                    }
                    if(by=='')
                        by = assetUpdate?.by!
                    // Get end date for current iteration
                    if (index < arr.length - 1)
                        nextDate = new Date(arr[index+1])
                        // Return history data
                        return { date_begin: dateObject, date_end: nextDate, asset_id: assetUpdate?._id, info_updated: assetUpdated, existing: existingParts, added: addedParts, removed: removedParts, by: by } as AssetEvent
                }))
                history.reverse()
                res.status(200).json(history as AssetHistory)
                }
                catch(err) {
                    handleError(err)
                    return res.status(500).send("API could not handle your request: " + err);
                }
            }
            // Get ID from query string
            let id = req.query.id as string
            // Check if ID is null or doesn't match ID type
            if (!id||!(/WNX([0-9]{7})+/.test(id)||mongoose.Types.ObjectId.isValid(id)))
            return res.status(400).send("Invalid request");
            // If NXID
            if (/WNX([0-9]{7})+/.test(id)) {
                Asset.findOne({asset_tag: id, next: null}, getHistory)
            }
            // If mongo ID
            else {
                Asset.findById(id, getHistory)
            }
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    }
};

export default assetManager

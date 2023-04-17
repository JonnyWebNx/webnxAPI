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

const assetManager = {
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

            switch(asset.asset_type) {
                case "Server":
                case "Switch":
                case "PDU":
                    // Remove location if no rails are present
                    if(!asset.in_rack||!asset.rails) {
                        delete asset.public_port;
                        delete asset.private_port;
                        delete asset.ipmi_port;
                        delete asset.power_port;
                    }
                    // Remove SID if not live
                    if(!asset.live) {
                        delete asset.sid;
                    }
                    break;
                case "Laptop":
                default:
                    delete asset.rails;
                    delete asset.in_rack;
                    delete asset.live;
                    delete asset.public_port;
                    delete asset.private_port;
                    delete asset.ipmi_port;
                    delete asset.power_port;
                    delete asset.sid;
                    break;
            }

            // Set sentinel value
            let existingSerial = ""
            // Check all part records
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
            // If serial already exists, return error
            if(existingSerial!="")
                return res.status(400).send(`Serial number ${existingSerial} already in inventory`);
            await Promise.all(parts.map(async (part) => {
                if(part.serial) {
                    await PartRecord.create({
                        nxid: part.nxid,
                        building: req.user.building,
                        location: "Asset",
                        asset_tag: asset.asset_tag,
                        serial: part.serial,
                        by: req.user.user_id,
                        date_created: dateCreated
                    })
                }
                else {
                    for (let i = 0; i < part.quantity!; i++) {
                        await PartRecord.create({
                            nxid: part.nxid,
                            building: req.user.building,
                            location: "Asset",
                            asset_tag: asset.asset_tag,
                            by: req.user.user_id,
                            date_created: dateCreated
                        })
                    }
                }
            }))
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
            .limit(Number(pageSize))
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
            switch(asset.asset_type) {
                case "Server":
                case "Switch":
                case "PDU":
                    // Remove location if no rails are present
                    if(!asset.in_rack||!asset.rails) {
                        delete asset.public_port;
                        delete asset.private_port;
                        delete asset.ipmi_port;
                        delete asset.power_port;
                    }
                    // Remove SID if not live
                    if(!asset.live) {
                        delete asset.sid;
                    }
                    break;
                case "Laptop":
                default:
                    delete asset.rails;
                    delete asset.in_rack;
                    delete asset.live;
                    delete asset.public_port;
                    delete asset.private_port;
                    delete asset.ipmi_port;
                    delete asset.power_port;
                    delete asset.sid;
                    break;
            }

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
            checkDifferenceSerialized(serializedPartsOnAsset, serializedPartsOnRequest, removed)
            checkDifferenceSerialized(serializedPartsOnRequest, serializedPartsOnAsset, added)
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
            checkDifferenceUnserialized(unserializedPartsOnAsset, unserializedPartsOnRequest, removed)
            checkDifferenceUnserialized(unserializedPartsOnRequest, unserializedPartsOnAsset, added)
            // Check for removed unserialized parts
            function updateParts(createOptions: PartRecordSchema, searchOptions: PartRecordSchema, arr: CartItem[]) {
                arr.map(async (p)=>{
                    let cOptions = JSON.parse(JSON.stringify(createOptions)) as PartRecordSchema
                    let sOptions = JSON.parse(JSON.stringify(searchOptions)) as PartRecordSchema
                    sOptions.nxid = p.nxid
                    cOptions.nxid = p.nxid
                    if(p.serial) {
                        cOptions.serial = p.serial
                        sOptions.serial = p.serial
                        let prev = await PartRecord.findOne(sOptions)
                        if(!prev)
                            return
                        cOptions.prev = prev._id
                        PartRecord.create(cOptions, callbackHandler.updateRecord)
                    }
                    else if(p.quantity) {
                        let toBeUpdated = await PartRecord.find(sOptions)
                        if (toBeUpdated.length < p.quantity)
                            return
                        for (let i = 0; i < p.quantity; i++) {
                            cOptions.prev = toBeUpdated[i]._id
                            PartRecord.create(cOptions, callbackHandler.updateRecord)
                        }
                    }
                })
            }
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
            updateParts(removedOptions, assetSearchOptions, removed)
            updateParts(addedOptions, userSearchOptions, added)
    
            // Update the asset object and return to user before updating parts records
            let getAsset = JSON.parse(JSON.stringify(await Asset.findOne({asset_tag: asset.asset_tag, next: null}))) as AssetSchema
            let save_id = asset._id
            delete getAsset.prev
            delete getAsset._id
            delete getAsset.next
            delete getAsset.date_created
            delete getAsset.date_replaced
            delete getAsset.date_updated
            delete getAsset.by
            delete getAsset.__v

            delete asset.prev
            delete asset._id
            delete asset.next
            delete asset.date_created
            delete asset.date_replaced
            delete asset.date_updated
            delete asset.by
            delete asset.__v
            if(JSON.stringify(getAsset) != JSON.stringify(asset)) {
                asset.prev = save_id
                asset.next = null
                asset.date_created = current_date
                asset.date_updated = current_date
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
                if(added.length>0||removed.length>0) {
                    await Asset.findByIdAndUpdate(save_id, { date_updated: current_date })
                }
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
                    if (!cachedRecords.has(item.nxid)) {
                        cachedRecords.set(item.nxid, {})
                        let part = await Part.findOne({nxid: item.nxid})
                        if(part) {
                            cachedRecords.set(item.nxid, part)
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
                    // Filter for removed parts, and loop over all of them
                    allPartRecords.filter(record => (record.date_replaced!=undefined)&&(record.date_replaced.toISOString() == updateDate)).map((record) => {
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
                    // Get end date for current iteration
                    if (index < arr.length - 1)
                        nextDate = new Date(arr[index+1])
                        // Return history data
                        return { date_begin: dateObject, date_end: nextDate, asset_id: assetUpdate?._id, info_updated: assetUpdated, existing: existingParts, added: addedParts, removed: removedParts } as AssetEvent
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

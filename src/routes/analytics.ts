import { getNumPages, getPageNumAndSize, getStartAndEndDate } from '../methods/genericMethods.js';
import { getAssetEventAsync, isValidAssetTag } from '../methods/assetMethods.js';
import { Request, Response } from 'express';
import { isValidPartID } from '../methods/partMethods.js';
import { getAllTechsDatesAsync, getAllTechsEventAsync, getAssetUpdates, getBoxUpdates, getCheckinDatesAsync, getCheckinEventsAsync, getCheckoutDatesAsync, getCheckoutEventsAsync, getEbayEvent, getEbaySalesDates, getPalletUpdates, getPartEventAsync, getPartEventDatesAsync, getPartsOnNewAsset, getPartsOnNewBox, getPartsOnNewPallet } from '../methods/analyticsMethods.js';
import handleError from '../util/handleError.js';
import Asset from '../model/asset.js';
import Pallet from '../model/pallet.js';
import { AssetUpdate, BoxUpdate, PalletUpdate } from '../interfaces.js';
import { getPalletEvent } from '../methods/palletMethods.js';
import { isValidBoxTag } from '../methods/boxMethods.js';
import { getBoxEvent } from '../methods/boxMethods.js';
import Box from '../model/box.js';

const analytics = {
    getCheckinHistory: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            // Get the check in dates using filters
            let dates = await getCheckinDatesAsync(startDate, endDate, users, nxids)
            // Total number of events
            let total = dates.length
            // Splice to page skip and size
            dates = dates
                .splice(pageSkip, pageSize)
            // Get the actual check in events.
            getCheckinEventsAsync(dates, users, hideOtherParts ? nxids : undefined).exec((err, checkins)=>{
                if(err) {
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Return to client
                res.status(200).json({total, pages: getNumPages(pageSize, total), events: checkins});
            })
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getCheckoutHistory: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            // Get user filter
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get location filter
            let location = req.query.location ? req.query.location as string : ""
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            // Check if other parts should be hidden
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            // Get the check in dates using filters
            let dates = await getCheckoutDatesAsync(startDate, endDate, users, location, nxids)
            // Total number of events
            let total = dates.length
            // Splice to page skip and size
            dates = dates
                .splice(pageSkip, pageSize)
            // Get the actual check in events.
            let checkouts = await getCheckoutEventsAsync(dates, users, location, hideOtherParts ? nxids : undefined)
            // Return to client
            res.status(200).json({total, pages: getNumPages(pageSize, total), events: checkouts});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getAssetUpdates: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            let asset_tags = Array.isArray(req.query.asset_tags) ? req.query.asset_tags as string[] : [] as string[]
            asset_tags = asset_tags.filter((s)=>isValidAssetTag(s))
            // Find added parts
            let assetUpdates = await getAssetUpdates(startDate, endDate, users, nxids, asset_tags)

            let totalUpdates = assetUpdates.length
            
            let returnValue = await Promise.all(assetUpdates.splice(pageSkip, pageSize).map((a)=>{
                return getAssetEventAsync(a.asset_tag, a.date, hideOtherParts ? nxids : undefined)
            }))
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates), events: returnValue});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getAssetUpdatesNoDetails: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            let asset_tags = Array.isArray(req.query.asset_tags) ? req.query.asset_tags as string[] : [] as string[]
            asset_tags = asset_tags.filter((s)=>isValidAssetTag(s))
            // Find added parts
            let assetUpdates = await getAssetUpdates(startDate, endDate, users, nxids, asset_tags)
            // Get all the dates of asset related events
            let totalUpdates = assetUpdates.length
            assetUpdates = assetUpdates
            .splice(pageSkip, pageSize)
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates),events: assetUpdates});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getNewAssets: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            nxids = nxids.filter((s)=>isValidPartID(s))
            if(nxids.length>0) {
                let updates = await getPartsOnNewAsset(startDate, endDate, users, nxids)
                updates = await Promise.all(updates.filter((u)=>{
                    return Asset.exists({asset_tag: u.asset_tag, by: u.by, date_created: u.by, prev: null})
                }))
                let total = updates.length
                if(total>0) {
                    updates = updates.splice(pageSkip, pageSize)
                    let returnValue = await Promise.all(updates.map((a: AssetUpdate)=>{
                        return getAssetEventAsync(a.asset_tag, a.date, hideOtherParts ? nxids : undefined)
                    }))
                    return res.status(200).json({total: total, pages: getNumPages(pageSize, total),events: returnValue});
                }
                // Return to client
                res.status(200).json({total: 0, pages: 1, events: []});
            }
            else {
                Asset.aggregate([
                    {
                        $match: {
                            $or: [{ prev: null}, {prev: {$exists: false}}],
                            by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                            date_created: { $lte: endDate, $gte: startDate }
                        }
                    },
                    {
                        $sort: {
                            "date_created": -1
                        }
                    },
                    // Get total count
                    {
                        $group: {
                            _id: null,
                            total: {$sum: 1},
                            updates: {$push: { asset_tag: "$asset_tag", date: "$date_created", by: "$by"}}
                        }
                    },
                    // Skip to page
                    {
                        $project: {
                            _id: 0,
                            total: 1,
                            updates: {$slice: ["$updates", pageSkip, pageSize]}
                        }
                    }
                ]).exec(async (err, result: { total: number, updates: AssetUpdate[]}[])=>{
                    if(err) {
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    if(result.length&&result.length>0) {
                        let returnValue = await Promise.all(result[0].updates!.map((a: AssetUpdate)=>{
                            return getAssetEventAsync(a.asset_tag, a.date)
                        }))
                        return res.status(200).json({total: result[0].total, pages: getNumPages(pageSize, result[0].total),events: returnValue});
                    }
                    // Return to client
                    res.status(200).json({total: 0, pages: 1, events: []});
                })
            }
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getNewAssetsNoDetails: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            if(nxids.length>0) {
                let updates = await getPartsOnNewAsset(startDate, endDate, users, nxids)
                updates = await Promise.all(updates.filter((u)=>{
                    return Asset.exists({asset_tag: u.asset_tag, by: u.by, date_created: u.by, prev: null})
                }))
                if(updates.length&&updates.length>0) {
                    return res.status(200).json({total: updates.length, pages: getNumPages(pageSize, updates.length),events: updates});
                }
                // Return to client
                res.status(200).json({total: 0, pages: 1, events: []});
            }
            else {
                Asset.aggregate([
                    {
                        $match: {
                            $or: [{ prev: null}, {prev: {$exists: false}}],
                            by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                            date_created: { $lte: endDate, $gte: startDate }
                        }
                    },
                    {
                        $sort: {
                            "date_created": -1
                        }
                    },
                    // Get total count
                    {
                        $group: {
                            _id: null,
                            total: {$sum: 1},
                            updates: {$push: { asset_tag: "$asset_tag", date: "$date_created", by: "$by"}}
                        }
                    },
                    // Skip to page
                    {
                        $project: {
                            _id: 0,
                            total: 1,
                            updates: {$slice: ["$updates", pageSkip, pageSize]}
                        }
                    }
                ]).exec(async (err, result: { total: number, updates: AssetUpdate[]}[])=>{
                    if(err) {
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    if(result.length&&result.length>0) {
                        return res.status(200).json({total: result[0].total, pages: getNumPages(pageSize, result[0].total),events: result[0].updates});
                    }
                    // Return to client
                    res.status(200).json({total: 0, pages: 1, events: []});
                })
            }
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getAllTechsHistory: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req);
            let skipPagination = req.query.skipPagination == 'true' ? true : false

            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))

            let dates = await getAllTechsDatesAsync(startDate, endDate, nxids, users)
            let totalEvents = dates.length
            dates = dates
                .splice(pageSkip, pageSize)
            // Get history
            let history = await Promise.all(dates.map((d)=>{
                return getAllTechsEventAsync(d, hideOtherParts ? nxids : undefined)
            }))
            // Calculate num pages
            let pages = getNumPages(pageSize, totalEvents)
            // Return to client
            res.status(200).json({total: totalEvents, pages, events: history})
        }
        catch(err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getPartCreationAndDeletionHistory: async (req: Request, res: Response) => {
        // Get data from query
        let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
        let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
        let skipPagination = req.query.skipPagination == 'true' ? true : false
        nxids = nxids.filter((s)=>isValidPartID(s))
        let { pageSize, pageSkip } = getPageNumAndSize(req);
        let { startDate, endDate } = getStartAndEndDate(req);
        let hideOtherParts = req.query.hideOthers == "true" ? true : false
        // Get event dates
        let dates = await getPartEventDatesAsync(startDate, endDate, nxids, users)
        // Total number of events
        let total = dates.length
        // Splice to page skip and size
        dates = dates
            .splice(pageSkip, pageSize)
        // Get history from map
        let history = await Promise.all(dates.map((d)=>getPartEventAsync(d, hideOtherParts ? nxids : undefined)))
        // Return data
        res.status(200).json({total, pages: getNumPages(pageSize, total), events: history})
    },

    getNewPallets: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            nxids = nxids.filter((s)=>isValidPartID(s))
            if(nxids.length>0) {
                // Get all possible updates with new parts
                let updates = await getPartsOnNewPallet(startDate, endDate, users, nxids)
                // Filter - Check if pallet was new on part creation
                updates = await Promise.all(updates.filter((u)=>{
                    return Pallet.exists({pallet_tag: u.pallet_tag, by: u.by, date_created: u.by, prev: null})
                }))
                // Store total
                let total = updates.length
                // If there are events
                if(total>0) {
                    // Splice to page
                    updates = updates.splice(pageSkip, pageSize)
                    // Map to pallet events
                    let returnValue = await Promise.all(updates.map((a: PalletUpdate)=>{
                        return getPalletEvent(a.pallet_tag, a.date, hideOtherParts ? nxids : undefined)
                    }))
                    return res.status(200).json({total: total, pages: getNumPages(pageSize, total),events: returnValue});
                }
                // Return to client
                res.status(200).json({total: 0, pages: 1, events: []});
            }
            else {
                Pallet.aggregate([
                    {
                        $match: {
                            $or: [{ prev: null}, {prev: {$exists: false}}],
                            by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                            date_created: { $lte: endDate, $gte: startDate }
                        }
                    },
                    {
                        $sort: {
                            "date_created": -1
                        }
                    },
                    // Get total count
                    {
                        $group: {
                            _id: null,
                            total: {$sum: 1},
                            updates: {$push: { pallet_tag: "$pallet_tag", date: "$date_created", by: "$by"}}
                        }
                    },
                    // Skip to page
                    {
                        $project: {
                            _id: 0,
                            total: 1,
                            updates: {$slice: ["$updates", pageSkip, pageSize]}
                        }
                    }
                ]).exec(async (err, result: { total: number, updates: PalletUpdate[]}[])=>{
                    if(err) {
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    if(result.length&&result.length>0) {
                        let returnValue = await Promise.all(result[0].updates!.map((a: PalletUpdate)=>{
                            return getPalletEvent(a.pallet_tag, a.date)
                        }))
                        return res.status(200).json({total: result[0].total, pages: getNumPages(pageSize, result[0].total),events: returnValue});
                    }
                    // Return to client
                    res.status(200).json({total: 0, pages: 1, events: []});
                })
            }
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getNewPalletsNoDetails: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            nxids = nxids.filter((s)=>isValidPartID(s))
            if(nxids.length>0) {
                // Get all possible updates with new parts
                let updates = await getPartsOnNewPallet(startDate, endDate, users, nxids)
                // Filter - Check if pallet was new on part creation
                updates = await Promise.all(updates.filter((u)=>{
                    return Pallet.exists({pallet_tag: u.pallet_tag, by: u.by, date_created: u.by, prev: null})
                }))
                // Store total
                let total = updates.length
                return res.status(200).json({total: total, pages: getNumPages(pageSize, total),events: updates});
            }
            else {
                Pallet.aggregate([
                    {
                        $match: {
                            $or: [{ prev: null}, {prev: {$exists: false}}],
                            by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                            date_created: { $lte: endDate, $gte: startDate }
                        }
                    },
                    {
                        $sort: {
                            "date_created": -1
                        }
                    },
                    // Get total count
                    {
                        $group: {
                            _id: null,
                            total: {$sum: 1},
                            updates: {$push: { pallet_tag: "$pallet_tag", date: "$date_created", by: "$by"}}
                        }
                    },
                    // Skip to page
                    {
                        $project: {
                            _id: 0,
                            total: 1,
                            updates: {$slice: ["$updates", pageSkip, pageSize]}
                        }
                    }
                ]).exec(async (err, result: { total: number, updates: PalletUpdate[]}[])=>{
                    if(err) {
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    if(result.length&&result.length>0) {
                        return res.status(200).json({total: result[0].total, pages: getNumPages(pageSize, result[0].total),events: result[0].updates});
                    }
                    // Return to client
                    res.status(200).json({total: 0, pages: 1, events: []});
                })
            }
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },


    getPalletUpdates: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            let box_tags = Array.isArray(req.query.box_tags) ? req.query.box_tags as string[] : [] as string[]
            let asset_tags = Array.isArray(req.query.asset_tags) ? req.query.asset_tags as string[] : [] as string[]
            let pallet_tags = Array.isArray(req.query.pallet_tags) ? req.query.pallet_tags as string[] : [] as string[]

            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            let palletUpdates = await getPalletUpdates(startDate, endDate, users, nxids, pallet_tags, asset_tags, box_tags)

            let totalUpdates = palletUpdates.length
            
            let returnValue = await Promise.all(palletUpdates.splice(pageSkip, pageSize).map((a)=>{
                return getPalletEvent(a.pallet_tag, a.date, hideOtherParts ? nxids : undefined)
            }))
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates), events: returnValue});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPalletUpdatesNoDetails: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            let box_tags = Array.isArray(req.query.box_tags) ? req.query.box_tags as string[] : [] as string[]
            let asset_tags = Array.isArray(req.query.asset_tags) ? req.query.asset_tags as string[] : [] as string[]
            let pallet_tags = Array.isArray(req.query.pallet_tags) ? req.query.pallet_tags as string[] : [] as string[]

            let palletUpdates = await getPalletUpdates(startDate, endDate, users, nxids, pallet_tags, asset_tags, box_tags)

            let totalUpdates = palletUpdates.length
            
            let returnValue = palletUpdates.splice(pageSkip, pageSize)
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates), events: returnValue});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    
    getEbaySalesHistory: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            let sales = await getEbaySalesDates(startDate, endDate, nxids, users)
            let totalUpdates = sales.length
            let returnValue = await Promise.all(sales.splice(pageSkip, pageSize).map(async (a)=>{
                return getEbayEvent(a, hideOtherParts?nxids:undefined)
            }))
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates), events: returnValue});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getBoxUpdates: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            let box_tags = Array.isArray(req.query.box_tags) ? req.query.box_tags as string[] : [] as string[]
            box_tags = box_tags.filter((s)=>isValidBoxTag(s))
            // Find added parts
            let boxUpdates = await getBoxUpdates(startDate, endDate, users, nxids, box_tags)

            let totalUpdates = boxUpdates.length

            if(!skipPagination) {
                boxUpdates = boxUpdates.splice(pageSkip, pageSize)
            }
            
            let returnValue = await Promise.all(boxUpdates.map((a)=>{
                return getBoxEvent(a.box_tag, a.date, hideOtherParts ? nxids : undefined)
            }))

            if(skipPagination) {
                return res.status(200).json(returnValue);
            }
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates), events: returnValue});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },

    getBoxUpdatesNoDetails: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))
            let box_tags = Array.isArray(req.query.box_tags) ? req.query.box_tags as string[] : [] as string[]
            box_tags = box_tags.filter((s)=>isValidBoxTag(s))
            // Find added parts
            let boxUpdates = await getBoxUpdates(startDate, endDate, users, nxids, box_tags)
            // Get all the dates of asset related events
            let totalUpdates = boxUpdates.length
            boxUpdates = boxUpdates
            .splice(pageSkip, pageSize)
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates),events: boxUpdates});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getNewBoxes: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let skipPagination = req.query.skipPagination == 'true' ? true : false
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            nxids = nxids.filter((s)=>isValidPartID(s))

            let updates = await getPartsOnNewBox(startDate, endDate, users, nxids)
            updates = await Promise.all(updates.filter((u)=>{
                return Box.exists({box_tag: u.box_tag, by: u.by, date_created: u.by, prev: null})
            }))
            let total = updates.length
            if(total>0) {
                if(!skipPagination) {
                    updates = updates.splice(pageSkip, pageSize)
                }
                let returnValue = await Promise.all(updates.map((a: BoxUpdate)=>{
                    return getBoxEvent(a.box_tag, a.date, hideOtherParts ? nxids : undefined)
                }))
                if(skipPagination) {
                    return res.status(200).json(returnValue);
                }
                return res.status(200).json({total: total, pages: getNumPages(pageSize, total),events: returnValue});
            }
            // Return to client
            res.status(200).json({total: 0, pages: 1, events: []});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getNewBoxesNoDetails: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))

            let updates = await getPartsOnNewBox(startDate, endDate, users, nxids)
            updates = await Promise.all(updates.filter((u)=>{
                return Box.exists({box_tag: u.box_tag, by: u.by, date_created: u.by, prev: null})
            }))
            if(updates.length&&updates.length>0) {
                updates = updates.splice(pageSkip, pageSize)
                return res.status(200).json({total: updates.length, pages: getNumPages(pageSize, updates.length),events: updates});
            }
            // Return to client
            res.status(200).json({total: 0, pages: 1, events: []});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    },
}

export default analytics

import PartRecord from '../model/partRecord.js'
import Asset from '../model/asset.js'
import { isValidPalletTag } from './palletMethods.js';
import { getAllKioskNames } from './partMethods.js';
import Pallet from '../model/pallet.js';
import { AssetSchema, AssetUpdate, BoxUpdate, PalletUpdate } from '../interfaces.js'
import { isValidObjectId } from 'mongoose';
import Box from '../model/box.js';

export async function getPartsOnNewAsset(startDate: Date, endDate: Date, users: string[], nxids: string[]) {
    return await PartRecord.aggregate([
        {
            $match: {
                by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                date_created: {$gte: startDate, $lte: endDate},
                asset_tag: { $ne: null },
                nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null },
                prev: null
            }
        },
        {
            $group: {
                _id: { asset_tag: "$asset_tag", date: "$date_created", by: "$by" }
            }
        },
        {
            $project: {
                _id: 0,
                asset_tag: "$_id.asset_tag",
                date: "$_id.date",
                by: "$_id.by"
            }
        },
        {
            $sort: {
                "date": -1
            }
        }
    ])  as AssetUpdate[]
}

export async function getPartsOnNewPallet(startDate: Date, endDate: Date, users: string[], nxids: string[]) {
    return await PartRecord.aggregate([
        {
            $match: {
                by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                date_created: {$gte: startDate, $lte: endDate},
                pallet_tag: { $ne: null },
                nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null },
                prev: null
            }
        },
        {
            $group: {
                _id: { pallet_tag: "$pallet_tag", date: "$date_created", by: "$by" }
            }
        },
        {
            $project: {
                _id: 0,
                pallet_tag: "$_id.pallet_tag",
                date: "$_id.date",
                by: "$_id.by"
            }
        },
        {
            $sort: {
                "date": -1
            }
        }
    ])  as PalletUpdate[]
}

export async function getPartsOnNewBox(startDate: Date, endDate: Date, users?: string[], nxids?: string[]) {
    return await PartRecord.aggregate([
        {
            $match: {
                by: users && users.length > 0 ? { $in: users } : { $ne: null },
                date_created: {$gte: startDate, $lte: endDate},
                box_tag: { $ne: null },
                nxid: nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null },
                prev: null
            }
        },
        {
            $group: {
                _id: { box_tag: "$box_tag", date: "$date_created", by: "$by" }
            }
        },
        {
            $project: {
                _id: 0,
                box_tag: "$_id.box_tag",
                date: "$_id.date",
                by: "$_id.by"
            }
        },
        {
            $sort: {
                "date": -1
            }
        }
    ])  as BoxUpdate[]
}

export async function getAssetUpdates(startDate: Date, endDate: Date, users: string[], nxids: string[], asset_tags: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                date_created: {$gte: startDate, $lte: endDate},
                asset_tag: (asset_tags&&asset_tags.length>0)?{ $in: asset_tags}:{ $ne: null },
                nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null }
                //prev: {$ne: null}
            }
        },
        {
            $group: {
                _id: { asset_tag: "$asset_tag", date: "$date_created", by: "$by" }
            }
        },
        {
            $project: {
                _id: 0,
                asset_tag: "$_id.asset_tag",
                date: "$_id.date",
                by: "$_id.by"
            }
        },
        {
            $sort: {
                "date": -1
            }
        }
    ])
    .then(async (assetUpdates: AssetUpdate[]) => {
        // Find removed parts
        return assetUpdates.concat(await PartRecord.aggregate([
            {
                $match: {
                    next_owner: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                    date_replaced: {$gte: startDate, $lte: endDate},
                    asset_tag: (asset_tags&&asset_tags.length>0)?{ $in: asset_tags}:{ $ne: null },
                    nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null }
                }
            },
            {
                $group: {
                    _id: { asset_tag: "$asset_tag", date: "$date_replaced", next_owner: "$next_owner" }
                }
            },
            {
                $project: {
                    _id: 0,
                    asset_tag: "$_id.asset_tag",
                    date: "$_id.date",
                    by: "$_id.next_owner"
                }
            },
            {
                $sort: {
                    "date": -1
                }
            }
        ])  as AssetUpdate[])
    })
    .then(async (assetUpdates: AssetUpdate[]) => {
        // Find updated assets
        if (nxids.length<1)
            assetUpdates = assetUpdates.concat(await Asset.aggregate([
                {
                    $match: {
                        asset_tag: (asset_tags&&asset_tags.length>0)?{ $in: asset_tags}:{ $ne: null },
                        by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                        date_created: {$gte: startDate, $lte: endDate},
                        prev: {$ne: null},
                    }
                },
                {
                    $group: {
                        _id: { asset_tag: "$asset_tag", date: "$date_created", by: "$by" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        asset_tag: "$_id.asset_tag",
                        date: "$_id.date",
                        by: "$_id.by"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ])  as AssetUpdate[])
        // Get all the dates of asset related events
        return assetUpdates
            .sort((a, b)=>{
                if (a.date.getTime() < b.date.getTime())
                    return 1
                return -1
            })
            .filter((a, i, arr)=>{return i===assetUpdates.findIndex((b)=>{
                return b.date.getTime()==a.date.getTime()&&a.asset_tag==b.asset_tag&&a.by==b.by
            })})
    })
}

export async function getPalletUpdates(startDate: Date, endDate: Date, users: string[], nxids: string[], pallet_tags: string[], asset_tags: string[], box_tags: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                date_created: {$gte: startDate, $lte: endDate},
                nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null },
                pallet_tag: pallet_tags.length > 0 ? { $in: pallet_tags } : { $ne: null },
                //prev: {$ne: null}
            }
        },
        {
            $group: {
                _id: { pallet_tag: "$pallet_tag", date: "$date_created", by: "$by" }
            }
        },
        {
            $project: {
                _id: 1,
                pallet_tag: "$_id.pallet_tag",
                date: "$_id.date",
                by: "$_id.by"
            }
        },
        {
            $sort: {
                "date": -1
            }
        }
    ])
    .then(async (palletUpdates: PalletUpdate[]) => {
        // Find removed parts
        return palletUpdates.concat(await PartRecord.aggregate([
            {
                $match: {
                    next_owner: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                    pallet_tag: pallet_tags.length > 0 ? { $in: pallet_tags } : { $ne: null },
                    date_replaced: {$gte: startDate, $lte: endDate},
                    nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null }
                }
            },
            {
                $group: {
                    _id: { pallet_tag: "$pallet_tag", date: "$date_replaced", next_owner: "$next_owner" }
                }
            },
            {
                $project: {
                    _id: 1,
                    pallet_tag: "$_id.pallet_tag",
                    date: "$_id.date",
                    by: "$_id.next_owner"
                }
            },
            {
                $sort: {
                    "date": -1
                }
            }
        ]))
    })
    .then(async (palletUpdates: PalletUpdate[]) => {
        // Find updated assets
        if (nxids.length<1) {
            palletUpdates = palletUpdates.concat(await Pallet.aggregate([
                {
                    $match: {
                        by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                        date_created: {$gte: startDate, $lte: endDate},
                        pallet_tag: pallet_tags.length > 0 ? { $in: pallet_tags } : { $ne: null },
                    }
                },
                {
                    $group: {
                        _id: { pallet_tag: "$pallet_tag", date: "$date_created", by: "$by" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        pallet_tag: "$_id.pallet_tag",
                        date: "$_id.date",
                        by: "$_id.by"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ])  as PalletUpdate[])
            palletUpdates = palletUpdates.concat(await Asset.aggregate([
                {
                    $match: {
                        by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                        date_created: {$gte: startDate, $lte: endDate},
                        pallet: pallet_tags.length > 0 ? { $in: pallet_tags } : { $ne: null },
                        asset_tag: asset_tags.length > 0 ? { $in: asset_tags } : { $ne: null },
                    }
                },
                {
                    $group: {
                        _id: { pallet_tag: "$pallet", prevPallet: "$prevPallet", date: "$date_created", by: "$by" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        pallet_tag: "$_id.pallet_tag",
                        prevPallet: "$_id.prevPallet",
                        date: "$_id.date",
                        by: "$_id.by"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ]))
            palletUpdates = palletUpdates.concat(await Asset.aggregate([
                {
                    $match: {
                        by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                        date_replaced: {$gte: startDate, $lte: endDate},
                        pallet: pallet_tags.length > 0 ? { $in: pallet_tags } : { $ne: null },
                        asset_tag: asset_tags.length > 0 ? { $in: asset_tags } : { $ne: null },
                    }
                },
                {
                    $group: {
                        _id: { pallet_tag: "$pallet", nextPallet: "$nextPallet", date: "$date_replaced", by: "$by" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        pallet_tag: "$_id.pallet_tag",
                        nextPallet: "$_id.nextPallet",
                        date: "$_id.date",
                        by: "$_id.by"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ]))
            palletUpdates = palletUpdates.concat(await Box.aggregate([
                {
                    $match: {
                        by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                        date_created: {$gte: startDate, $lte: endDate},
                        location: pallet_tags.length > 0 ? { $in: pallet_tags } : { $regex: /PAL([0-9]{5})+/ },
                        box_tag: box_tags.length > 0 ? { $in: box_tags } : { $ne: null },
                    }
                },
                {
                    $group: {
                        _id: { pallet_tag: "$location", prevPallet: "$prev_location", date: "$date_created", by: "$by" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        pallet_tag: "$_id.pallet_tag",
                        prevPallet: "$_id.prevPallet",
                        date: "$_id.date",
                        by: "$_id.by"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ]))
            palletUpdates = palletUpdates.concat(await Box.aggregate([
                {
                    $match: {
                        by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                        date_replaced: {$gte: startDate, $lte: endDate},
                        location: pallet_tags.length > 0 ? { $in: pallet_tags } : { $regex: /PAL([0-9]{5})+/ },
                        box_tag: box_tags.length > 0 ? { $in: box_tags } : { $ne: null },
                    }
                },
                {
                    $group: {
                        _id: { pallet_tag: "$location", nextPallet: "$next_location", date: "$date_replaced", by: "$by" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        pallet_tag: "$_id.pallet_tag",
                        nextPallet: "$_id.nextPallet",
                        date: "$_id.date",
                        by: "$_id.by"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ]))
        }
        // Get all the dates of asset related events
        return palletUpdates
            .filter((p)=>{
                if(p.prevPallet&&p.prevPallet==p.pallet_tag)
                    return false
                if(p.nextPallet&&p.nextPallet==p.pallet_tag)
                    return false
                return isValidPalletTag(p.pallet_tag)
            })
            .sort((a, b)=>{
                if (a.date.getTime() < b.date.getTime())
                    return 1
                return -1
            })
            .filter((a, i, arr)=>{return i===palletUpdates.findIndex((b)=>{
                return b.date.getTime()==a.date.getTime()&&a.pallet_tag==b.pallet_tag&&a.by==b.by
            })})
    })
}

export async function getCheckinDatesAsync(startDate: Date, endDate: Date, users: string[] | undefined, nxids: string[] | undefined) {
    // Get the dates, filter by NXID or user_id if needed
    let dates = await PartRecord.find(
        {
            next: { $ne: null },
            location: "Check In Queue",
            by: (users&&users.length > 0 ? { $in: users } : { $ne: null }),
            date_created: { $lte: endDate, $gte: startDate },
            nxid: (nxids&&nxids.length > 0 ? { $in: nxids } : { $ne: null })
        }
    ).distinct("date_created") as Date[]
    // Sort the dates
    return dates.sort((a: Date, b: Date) => { 
        if (a < b)
            return 1
        return -1
    })
}

export function getCheckinEventsAsync(dates: Date[], users: string[] | undefined, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            // Get checkin queue
            $match: {
                next: { $ne: null },
                location: "Check In Queue",
                by: (users&&users.length > 0 ? { $in: users } : { $ne: null }),
                date_created: { $in: dates },
                nxid: (nxids&&nxids.length > 0 ? { $in: nxids } : { $ne: null })}
        },
        {
            // GROUP BY DATE, USER, NXID, AND SERIAL
            $group: {
                _id: { date: "$date_created", by: "$by", nxid: "$nxid", serial: "$serial", next_owner: "$next_owner" },
                // GET QUANTITY
                quantity: { $sum: 1 } 
            }
        },
        {
            // GROUP BY DATA AND USER
            $group: {
                _id: { date: "$_id.date", by: "$_id.by" },
                // PUSH NXID, SERIAL, AND QUANTITY to array
                parts: { 
                    $push: { 
                        nxid: "$_id.nxid", 
                        serial: "$_id.serial", 
                        // Remove quantity for serialized
                        quantity: {
                            $cond: [
                                {
                                    $eq: ["$_id.serial", "$arbitraryNonExistentField"]
                                },
                                "$quantity",
                                "$$REMOVE"
                            ]
                        },  
                        // IF next owner exists, part was denied
                        approved: {
                            $cond: [ 
                                {$eq: ["$_id.next_owner", "$arbitraryNonExistentField"]}, true, false
                            ]
                        }
                    } 
                }
            }
        },
        {
            $project: {
                _id: 0,
                date: "$_id.date",
                by: "$_id.by",
                parts: "$parts"
            }
        },
        {
            $sort: {
                "date": -1
            }
        },
    ])
}

export async function getCheckoutDatesAsync(startDate: Date, endDate: Date, users: string[] | undefined, location: string, nxids: string[] | undefined) {
    let kiosks = await getAllKioskNames()
    let dates = await PartRecord.find(
        {
            // Get checkin queue
            nxid: (nxids&&nxids.length > 0 ? { $in: nxids } : { $ne: null }), 
            next: { $ne: null }, 
            location: location != "" ? location : { $in: kiosks }, 
            next_owner: (users&&users.length > 0 ? { $in: users } : { $ne: null }), 
            // Check if next is valid ID
            $expr: {
                $and: [

                    {
                        $ne: [
                            {
                                $convert: {
                                    input: "$next",
                                    to: "objectId",
                                    onError: "bad"
                                }
                            },
                            "bad"
                        ]
                    },
                    {
                        $ne: [
                            {
                                $convert: {
                                    input: "$next_owner",
                                    to: "objectId",
                                    onError: "bad"
                                }
                            },
                            "bad"
                        ]
                    }
                ]
            },
            date_replaced: { $gte: startDate, $lte: endDate } 
        } 
    ).distinct("date_replaced") as Date[]
    // Sort the dates
    return dates.sort((a: Date, b: Date) => { 
        if (a < b)
            return 1
        return -1
    })
}

export async function getCheckoutEventsAsync(dates: Date[], users: string[] | undefined, location: string, nxids: string[] | undefined) {
    let kiosks = await getAllKioskNames()
    return await PartRecord.aggregate([
        {
            // Get checkin queue
            $match: { 
                // Get checkin queue
                nxid: (nxids&&nxids.length > 0 ? { $in: nxids } : { $ne: null }), 
                next: { $ne: null }, 

                location: location != "" ? location : { $in: kiosks}, 
                next_owner: (users&&users.length > 0 ? { $in: users } : { $ne: null }), 
                // Check if next is valid ID
                $expr: {
                    $and: [

                        {
                            $ne: [
                                {
                                    $convert: {
                                        input: "$next",
                                        to: "objectId",
                                        onError: "bad"
                                    }
                                },
                                "bad"
                            ]
                        },
                        {
                            $ne: [
                                {
                                    $convert: {
                                        input: "$next_owner",
                                        to: "objectId",
                                        onError: "bad"
                                    }
                                },
                                "bad"
                            ]
                        }
                    ]
                },
                date_replaced: { $in: dates }
            } 
        },
        {
            $project: {
                nxid: 1,
                date_replaced: 1,
                serial: 1,
                location: 1,
                owner: {
                    $convert: {
                        input: "$next_owner",
                        to: "objectId",
                        onError: "ERROR"
                    }
                }
            }
        },
        {
            // GROUP BY DATE, USER, NXID, AND SERIAL
            $group: {
                _id: { date: "$date_replaced", nxid: "$nxid", serial: "$serial", location: "$location", owner: "$owner" },
                next: {$push: "$next"},
                // GET QUANTITY
                quantity: { $sum: 1 } 
            }
        },
        // Group parts on same checkout together
        {
            // GROUP BY DATA AND USER
            $group: {
                _id: { date: "$_id.date", location: "$_id.location", owner: "$_id.owner" },
                next: { $push: "$next" },
                // PUSH NXID, SERIAL, AND QUANTITY to array
                // Comparing to undefined or null always returned false, so $arbitraryNonExistentField is used to check if serial exists or not
                parts: { $push: { nxid: "$_id.nxid", serial: "$_id.serial", quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]} } },
            }
        },
        // Restructure object
        {
            $project: {
                _id: 0,
                date: "$_id.date",
                by:  "$_id.owner",
                location: "$_id.location",
                parts: "$parts"
            }
        },
        // Sort by date in descending order
        {
            $sort: {
                "date": -1
            }
        }
    ])
}

export async function getAllTechsDatesAsync(startDate: Date, endDate: Date, nxids: string[] | undefined, users: string[] | undefined) {
    let dates = [] as Date[]
    // Get parts added
    return dates
        .concat(await PartRecord.find({
            owner: "all",
            date_created: { $gte: startDate, $lte: endDate},
            nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
            by: (users && users.length > 0 ? { $in: users } : { $ne: null })
        }).distinct("date_created") as Date[])
        .concat(await PartRecord.find({
            owner: "all",
            date_replaced: { $gte: startDate, $lte: endDate},
            nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
            next_owner: (users && users.length > 0 ? { $in: users } : { $ne: null }),
        }).distinct("date_replaced") as Date[])
        .sort((a: Date, b: Date) => { 
            if (a < b)
                return 1
            return -1
        })
        .filter((d)=>d!=null)
        .map((d)=>d.getTime())
        .filter((date, index, arr) => arr.indexOf(date) === index && date != null)
        .map((d)=>new Date(d))
}

export function getAddedPartsAllTechsAsync(date: Date, nxids: string[] | undefined) {
    return PartRecord.aggregate([
        {
            $match: { owner: "all", date_created: date,
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
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

export function getRemovedPartsAllTechsAsync(date: Date, nxids: string[] | undefined) {
    return PartRecord.aggregate([
        {
            $match: { owner: "all", date_replaced: date,
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
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
                next: "$next",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export function getExistingPartsAllTechsAsync(date: Date, nxids: string[] | undefined) {
    return PartRecord.aggregate([
        {
            $match: { owner: "all", date_created: { $lt: date }, $or: [
                    {date_replaced: null}, 
                    {date_replaced: { $gt: date }}
                ],
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
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
                _id: 0,
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export async function getPartEventDatesAsync(startDate: Date, endDate: Date, nxids: string[] | undefined, users: string[] | undefined) {
    return PartRecord.find({
        // Find new records in data range
        nxid: nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null },
        by: users && users.length > 0 ? { $in: users } : { $ne: null },
        date_created: { $lte: endDate, $gte: startDate },
        $or: [
            {
                prev: null
            },
            {
                $and: [
                    {
                        $expr: {
                            $eq: [
                                {
                                    $convert: {
                                        input: "$next",
                                        to: "objectId",
                                        onError: "bad"
                                    }
                                },
                                "bad"
                            ]
                        }
                    },
                    {
                        $expr: {
                            $ne: [
                                "$next",
                                "consumed"
                            ]
                        }
                    }
                ]
            }
        ]
    })
    .distinct("date_created")
    .then((dates: Date[])=>{
        return dates
        .filter((d)=>d!=null)
        .map((d)=>d.getTime())
        .filter((date, index, arr) => arr.indexOf(date) === index && date != null)
        .map((d)=>new Date(d))
        .sort((a, b)=>{
            if (a < b)
                return 1
            return -1
        })
    })
}

// export function getEbaySales(startDate: Date, endDate: Date, nxids: string[] | undefined, users: string[] | undefined) {
//     return PartRecord.aggregate(
//         [
//             {
//                 $match: {
//                     nxid: nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null },
//                     by: users && users.length > 0 ? { $in: users } : { $ne: null },
//                     date_created: { $lte: endDate, $gte: startDate },
//                     next: "sold",
//                 },
//             },
//             {
//                 $group: {
//                     _id: {
//                         nxid: "$nxid",
//                         serial: "$serial",
//                         date: "$date_created",
//                         order: "$ebay",
//                         by: "$by",
//                     },
//                     quantity: {
//                         $sum: 1,
//                     },
//                 },
//             },
//             {
//                 $project: {
//                     _id: 0,
//                     nxid: "$_id.nxid",
//                     serial: "$_id.serial",
//                     date: "$_id.date",
//                     order: "$_id.order",
//                     by: "$_id.by",
//                     quantity: {
//                         $cond: [
//                             {
//                                 $eq: [
//                                     "$_id.serial",
//                                     "$arbitraryNonExistentField",
//                                 ],
//                             },
//                             "$quantity",
//                             "$$REMOVE",
//                         ],
//                     },
//                 },
//             },
//             {
//                 $group: {
//                     _id: {
//                         date: "$date",
//                         order: "$order",
//                         by: "$by",
//                     },
//                     parts: {
//                         $push: {
//                             nxid: "$nxid",
//                             serial: "$serial",
//                             quantity: "$quantity",
//                         },
//                     },
//                 },
//             },
//             {
//                 $project: {
//                     _id: 0,
//                     date: "$_id.date",
//                     order: "$_id.order",
//                     by: "$_id.by",
//                     parts: "$parts",
//                 },
//             },
//             {
//                 $sort: {
//                     date: -1
//                 }
//             }
//         ]
//     ).exec()
// }

export async function getEbaySalesDates(startDate: Date, endDate: Date, nxids: string[] | undefined, users: string[] | undefined) {
    return PartRecord.find({
        nxid: nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null },
        by: users && users.length > 0 ? { $in: users } : { $ne: null },
        date_created: { $lte: endDate, $gte: startDate },
        next: "sold",
    }).distinct("date_created")
    .then(async (dates: Date[]) => {
        let d = [] as Date[]
        if(nxids&&nxids.length>0)
            d = await Asset.find({
                by: users && users.length > 0 ? { $in: users } : { $ne: null },
                date_created: { $lte: endDate, $gte: startDate },
                next: "sold",
            }).distinct("date_created")
        return dates.concat(d)
    })
    .then((dates: Date[]) => {
        return dates
            .filter((d)=>d!=null)
            .map((d)=>d.getTime())
            .filter((date, index, arr) => arr.indexOf(date) === index && date != null)
            .map((d)=>new Date(d))
            .sort((a, b)=>{
                if (a < b)
                    return 1
                return -1
            })
    })
}


export function getPartsAddedAsync(date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
                date_created: date,
                prev: null
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
                _id: 0,
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export async function getEbayEvent(date: Date, nxids: string[] | undefined) {
    let assets = await Asset.aggregate([
        {
            $match: {
                date_created: date,
                next: "sold",
            },
        },
    ]).exec()
    let partsQuery = await PartRecord.aggregate(
        [
            {
                $match: {
                    nxid: nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null },
                    date_created: date,
                    next: "sold",
                },
            },
            {
                $group: {
                    _id: {
                        nxid: "$nxid",
                        serial: "$serial",
                        date: "$date_created",
                        order: "$ebay",
                        asset_tag: "$asset_tag",
                        by: "$by",
                    },
                    quantity: {
                        $sum: 1,
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    nxid: "$_id.nxid",
                    serial: "$_id.serial",
                    date: "$_id.date",
                    order: "$_id.order",
                    by: "$_id.by",
                    asset_tag: "$_id.asset_tag",
                    quantity: {
                        $cond: [
                            {
                                $eq: [
                                    "$_id.serial",
                                    "$arbitraryNonExistentField",
                                ],
                            },
                            "$quantity",
                            "$$REMOVE",
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: {
                        date: "$date",
                        order: "$order",
                        by: "$by",
                    },
                    parts: {
                        $push: {
                            nxid: "$nxid",
                            asset_tag: "$asset_tag",
                            serial: "$serial",
                            quantity: "$quantity",
                        },
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    date: "$_id.date",
                    order: "$_id.order",
                    by: "$_id.by",
                    parts: "$parts",
                },
            },
        ]
    ).exec()
    // Get order from array
    let order = partsQuery[0] as { date: Date, order: string, by: string, parts: any[], assets: AssetSchema[] }
    // Filter out asset parts
    let assetParts = order.parts.filter((v)=>v.asset_tag)
    order.parts = order.parts.filter((v)=>!v.asset_tag)
    // Create asset map
    let assetMap = new Map<string, AssetSchema>()
    // Fill asset map
    for(let asset of assets) {
        asset.parts = []
        assetMap.set(asset.asset_tag, asset)
    }
    // Loop through asset parts
    for(let part of assetParts) {
        // Create fallback asset
        let asset = { asset_tag: part.asset_tag, parts: [] } as AssetSchema
        // If asset is in map
        if(assetMap.has(part.asset_tag)) {
            // Load it
            asset = assetMap.get(part.asset_tag)!
        }
        // Push part 
        asset.parts.push({nxid: part.nxid, serial: part.serial, quantity: part.quantity})
        // Update Map
        assetMap.set(asset.asset_tag!, asset)
    }
    // Add them to ebay order
    order.assets = Array.from(assetMap.values())
    return order
}



export function getPartsRemovedAsync(date: Date, nxids?: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
                date_created: date,
                $expr: {
                    $eq: [
                        {
                            $convert: {
                                input: "$next",
                                to: "objectId",
                                onError: "bad"
                            }
                        },
                        "bad"
                    ]
                }
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
                _id: 0,
                nxid: "$_id.nxid",
                serial: "$_id.serial",
                quantity: {$cond: [{$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"]}
            }
        }
    ])
}

export async function getPartEventAsync(date: Date, nxids?: string[]) {
    // Try to get an added part
    let filterQ = await PartRecord.findOne({prev: null, date_created: date,
            nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null })
    })
    let filterQ2 = filterQ
    // If no added part
    if(!filterQ) {
        // Find a removed part
        filterQ = await PartRecord.findOne({
            date_created: date,
            nxid: (nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null }),
            $expr: {
                $eq: [
                    {
                        $convert: {
                            input: "$next",
                            to: "objectId",
                            onError: "bad"
                        }
                    },
                    "bad"
                ]
            }
        })
        filterQ2 = filterQ
        if(filterQ?.location!="sold") {
            // Get previous for filter details
            if(filterQ&&filterQ.prev)
                filterQ2 = await PartRecord.findById(filterQ.prev)
            else
                filterQ = {
                    pallet_tag: "ERROR",
                    owner: "ERROR",
                    location: "ERROR",
                    by: "ERROR",
                } as any
        }
    }
    // Create filter
    let filter = {
        pallet_tag: filterQ2 && filterQ2.pallet_tag ? filterQ2.pallet_tag : undefined,
        asset_tag: filterQ2 && filterQ2.asset_tag ? filterQ2.asset_tag : undefined,
        owner: filterQ && filterQ.owner ? filterQ.owner : undefined,
        location: filterQ2 && filterQ2.location ? filterQ2.location : undefined,
        by: filterQ && filterQ.by ? filterQ.by : undefined,
        ebay: filterQ && filterQ.ebay ? filterQ.ebay : undefined
    }
    // Get added parts
    let added = await getPartsAddedAsync(date, nxids)
    // Get removed parts
    let removed = await getPartsRemovedAsync(date, nxids)
    // Return history event
    return { date, info: filter, added, removed }
}

export async function getAllTechsEventAsync(date: Date, nxids?: string[]) {
    let existing = await getExistingPartsAllTechsAsync(date, nxids)
    let added = await getAddedPartsAllTechsAsync(date, nxids)
    let removed = await getRemovedPartsAllTechsAsync(date, nxids)
    let by = ""
    // Get by from added
    if(added.length>0) {
        // Loop through all just in case
        for(let part of added) {
            // Check if ID is valid
            if(isValidObjectId(part.by)) {
                // Set by
                by = part.by
                // Break loop
                break
            }
        }
    }
    // Get by from removed
    if(by==""&&removed.length>0) {
        // Loop until by is found
        for(let part of removed) {
            // Next owner is valid user
            if(isValidObjectId(part.next_owner)) {
                by = part.next_owner
                break
            }
            else {
                // Control for breaking loop
                let byFound = false
                // Loop through aggregated next IDs
                for(let n of part.next) {
                    // Try to find part
                    let rec = await PartRecord.findById(n)
                    // If found and is valid user
                    if(rec&&rec.by&&isValidObjectId(rec.by)) 
                    {
                        // Set variable
                        by = rec.by as string
                        // Set loop control to break outer loop
                        byFound = true
                        // Break this inner loop
                        break
                    }
                }
                // Break loop if found
                if(byFound)
                    break
                // Next owner
            }
        }
    }
    // Remove useless data
    added = added.map((p)=>{ return {nxid: p.nxid, serial: p.serial, quantity: p.quantity} })
    removed = removed.map((p)=>{ return {nxid: p.nxid, serial: p.serial, quantity: p.quantity} })
    // Return event
    return {by, date, existing, added, removed}
}


export async function getBoxUpdates(startDate: Date, endDate: Date, users: string[], nxids: string[], box_tags: string[]) {
    return PartRecord.aggregate([
        {
            $match: {
                by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                date_created: {$gte: startDate, $lte: endDate},
                box_tag: (box_tags&&box_tags.length>0)?{ $in: box_tags}:{ $ne: null },
                nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null }
                //prev: {$ne: null}
            }
        },
        {
            $group: {
                _id: { box_tag: "$box_tag", date: "$date_created", by: "$by" }
            }
        },
        {
            $project: {
                _id: 0,
                box_tag: "$_id.box_tag",
                date: "$_id.date",
                by: "$_id.by"
            }
        },
        {
            $sort: {
                "date": -1
            }
        }
    ])
    .then(async (boxUpdates: BoxUpdate[]) => {
        // Find removed parts
        return boxUpdates.concat(await PartRecord.aggregate([
            {
                $match: {
                    next_owner: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                    date_replaced: {$gte: startDate, $lte: endDate},
                    box_tag: (box_tags&&box_tags.length>0)?{ $in: box_tags}:{ $ne: null },
                    nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null }
                }
            },
            {
                $group: {
                    _id: { box_tag: "$box_tag", date: "$date_replaced", next_owner: "$next_owner" }
                }
            },
            {
                $project: {
                    _id: 0,
                    box_tag: "$_id.box_tag",
                    date: "$_id.date",
                    by: "$_id.next_owner"
                }
            },
            {
                $sort: {
                    "date": -1
                }
            }
        ])  as BoxUpdate[])
    })
    .then(async (boxUpdates: BoxUpdate[]) => {
        // Find updated assets
        if (nxids.length<1)
            boxUpdates = boxUpdates.concat(await Box.aggregate([
                {
                    $match: {
                        box_tag: (box_tags&&box_tags.length>0)?{ $in: box_tags}:{ $ne: null },
                        by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                        date_created: {$gte: startDate, $lte: endDate},
                        prev: {$ne: null},
                    }
                },
                {
                    $group: {
                        _id: { box_tag: "$box_tag", date: "$date_created", by: "$by" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        box_tag: "$_id.box_tag",
                        date: "$_id.date",
                        by: "$_id.by"
                    }
                },
                {
                    $sort: {
                        "date": -1
                    }
                }
            ])  as BoxUpdate[])
        // Get all the dates of asset related events
        return boxUpdates
            .sort((a, b)=>{
                if (a.date.getTime() < b.date.getTime())
                    return 1
                return -1
            })
            .filter((a, i, arr)=>{return i===boxUpdates.findIndex((b)=>{
                return b.date.getTime()==a.date.getTime()&&a.box_tag==b.box_tag&&a.by==b.by
            })})
    })
}



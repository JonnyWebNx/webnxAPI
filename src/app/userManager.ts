/**
 * 
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Collection of functions for manipulating User entries in the database
 * 
 * 
 */
// Import user schema
import bcrypt from 'bcryptjs'
import User from '../model/user.js'
import { isValidObjectId, MongooseError } from 'mongoose';
import type { Request, Response } from 'express'
import { UserSchema, AssetUpdate, CartItem, PartRecordSchema, PalletEvent, PalletUpdate } from './interfaces.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import handleError from '../config/handleError.js'
import nodemailer from 'nodemailer'
import { Options } from 'nodemailer/lib/mailer/index.js'
import config from '../config.js'
import crypto from 'crypto'
import resetToken from '../model/resetToken.js';
import PartRecord from '../model/partRecord.js'
import Asset from '../model/asset.js'
import { getAssetEventAsync, isValidAssetTag } from './methods/assetMethods.js';
import { getPalletEvent, isValidPalletTag } from './palletManager.js';
import { getNumPages, getPageNumAndSize, getStartAndEndDate } from './methods/genericMethods.js';
import { getAllKioskNames, isValidPartID } from './methods/partMethods.js';
import Pallet from '../model/pallet.js';
const { UPLOAD_DIRECTORY, EMAIL, EMAIL_PASS } = config


async function getPartsOnNewAsset(startDate: Date, endDate: Date, users: string[], nxids: string[]) {
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

async function getPartsOnNewPallet(startDate: Date, endDate: Date, users: string[], nxids: string[]) {
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

async function getAssetUpdates(startDate: Date, endDate: Date, users: string[], nxids: string[], asset_tags: string[]) {
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

function getPalletUpdates(startDate: Date, endDate: Date, users: string[], nxids: string[]) {
     return PartRecord.aggregate([
            {
                $match: {
                    by: (users && users.length > 0 ? { $in: users } : { $ne: null }),
                    date_created: {$gte: startDate, $lte: endDate},
                    pallet_tag: { $ne: null },
                    nxid: nxids.length > 0 ? { $in: nxids } : { $ne: null }
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
                    pallet_tag: { $ne: null },
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
                        pallet: { $ne: null },
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
                        pallet: { $ne: null },
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
                                {$eq: ["$_id.serial", "$arbitraryNonExistentField"]},"$quantity", "$$REMOVE"
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

export function getPartEventDatesAsync(startDate: Date, endDate: Date, nxids: string[] | undefined, users: string[] | undefined) {
    return PartRecord.find({
        // Find new records in data range
        nxid: nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null },
        by: users && users.length > 0 ? { $in: users } : { $ne: null },
        date_created: { $lte: endDate, $gte: startDate },
        $or: [
            {prev: null},
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

export function getEbaySales(startDate: Date, endDate: Date, nxids: string[] | undefined, users: string[] | undefined) {
    return PartRecord.aggregate(
        [
            {
                $match: {
                    nxid: nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null },
                    by: users && users.length > 0 ? { $in: users } : { $ne: null },
                    date_created: { $lte: endDate, $gte: startDate },
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
            {
                $sort: {
                    date: -1
                }
            }
        ]
    )
}

export function getEbaySalesDates(startDate: Date, endDate: Date, nxids: string[] | undefined, users: string[] | undefined) {
    return PartRecord.find({
        nxid: nxids && nxids.length > 0 ? { $in: nxids } : { $ne: null },
        by: users && users.length > 0 ? { $in: users } : { $ne: null },
        date_created: { $lte: endDate, $gte: startDate },
        next: "sold",
    }).distinct("date_created")
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

export function getEbayEvent(date: Date, nxids: string[] | undefined) {
    return PartRecord.aggregate(
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
    )
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

// Main object containing functions
const userManager = {
    // Read
    getUser: async (req: Request, res: Response) => {
        try{
            // Make sure query string has id
            let id = req.query.id || req.user.user_id;
            // Find user in database
            User.findById(id, (err: MongooseError, user: UserSchema) => {
                if (err) {
                    res.status(500).send("API could not handle your request: "+err);        
                    return 
                }
                if(user){
                    // If user is found
                    // remove password from response
                    let { password, ...returnUser } = JSON.parse(JSON.stringify(user))
                    res.status(200).send(returnUser);
                    return 
                }
                // If user is not found
                res.status(400).send("User not found."); 
            });
        } catch(err) {
            // Database error
            res.status(500).send("API could not handle your request: "+err);
            return 
        }
    },

    getAllUsers: async (req: Request, res: Response) => {
        try{
            // Get all users
            let users = await User.find() as UserSchema[];
            let returnUsers = [] as UserSchema[]
            // Remove password from data
            for (let user of users){
                let { password, role, ...temp } = JSON.parse(JSON.stringify(user))
                returnUsers.push(temp)
            }
            // Success
            return res.status(200).json(returnUsers);
        } catch(err) {
            // Database error
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    // Update - id required in query string
    updateUser: async (req: Request, res: Response) => {
        try{
            // Check database to see if email already exists
            const submittedUser = req.body.user
            var emailExists = await User.findOne({email: submittedUser.email});
            if (emailExists&&submittedUser._id!=emailExists._id){
                // Email already exists in database and does not belong to user
                return res.status(409).send("Email taken.")
            }
            // Delete password from request
            delete submittedUser.password;
            // Send update query to database
            var user = await User.findByIdAndUpdate(submittedUser._id, submittedUser)
            if(user){
                // User was found and updated
                return res.status(200).send(`Updated user: ${user.email}`);
            }
            // User was not found
            return res.status(400).send("User not found.");
        } catch(err) {
            // Database error
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    sendPasswordResetEmail: async (req: Request, res: Response) => {
        let email = req.query.email
        let user = await User.findOne({email})
        if(!user)
            return res.status(400).send("User not found")
        // Check for existing token
        let existingToken = await resetToken.findOne({ userId: user._id })
        // Delete if one already exists
        if (existingToken)
            await resetToken.deleteOne(existingToken._id)
        // Create new token
        let newResetToken = crypto.randomBytes(32).toString("hex");
        // Create hash of token
        const hash = await bcrypt.hash(newResetToken, 10);
        // Create new token
        await resetToken.create({ userId: user._id, token: hash })
        
        let link = `https://inventory.webnx.com/passwordReset?token=${newResetToken}&userId=${user._id}`
        let transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: EMAIL,
                pass: EMAIL_PASS
            }
        });
        let mailOptions = {
            from: EMAIL,
            to: email,
            subject: `Password Reset`,
            text: `Here is a password reset link, it will expire in 1 hour.\n${link}`
        };
        transporter.sendMail(mailOptions as Options, function(err){
            transporter.close()
            if (err) {
                console.log(err)
                return res.status(500).send("Email failed to send.");
            }
            return res.status(200).send("Email sent.");
        }); 
    },

    updatePassword: async (req: Request, res: Response) => {
        // get password
        const { user_id, token, password } = req.body;
        try {
            if(!user_id||!password||!token)
                return res.status(400).send("Invalid request.");
            let user = await User.findById(user_id)
            let databaseToken = await resetToken.findOne({userId: user_id})
            // Check request
            if(!databaseToken)
                return res.status(400).send("Token expired or invalid.");
            if(!user)
                return res.status(400).send("User not found")
            // Check if token is valid
            let tokenValid = bcrypt.compare(token, databaseToken.token!)
            // Return if token invalid
            if(!tokenValid){
                return res.status(400).send("Invalid token.");
            }
            const encryptedPassword = await bcrypt.hash(password, 10);
            await User.findByIdAndUpdate(user_id, { password: encryptedPassword });
            await resetToken.findByIdAndDelete(databaseToken._id)
            return res.status(200).send("Success");
        } catch(err) {
            return res.status(500).send("API could not handle your request: "+err);
        }
    },

    // Delete - id required in query string
    deleteUser: async (req: Request, res: Response) => {
        var userToDelete = req.query.id;
        // Send id to database for deletion
        User.findByIdAndDelete(userToDelete, (err: MongooseError, user: UserSchema) => {
            if(err){
                // Database encountered error
                return res.status(500).send("API could not handle your request: "+err);
            } else if(!user){
                // User was not found
                return res.status(400).send("User not found.");
            }
            // User was successfully deleted
            return res.status(200).send(`Deleted: ${user.first_name} ${user.last_name}`);
        });
    },

    getUserImage: async (req: Request, res: Response) => {
        try {
            // Create path to image
            let imagePath = path.join(UPLOAD_DIRECTORY, 'images/users', `${req.params.id}.webp`)
            // Check if it exists and edit path if it doesn't
            if(!existsSync(imagePath))
                imagePath = path.join(UPLOAD_DIRECTORY, 'images', 'defaultUserImage.webp')
            // Send image
            res.sendFile(imagePath)
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    
    checkRoles: async (req: Request, res: Response) => {
        try {
            let user = User.findById(req.user.user_id) as UserSchema
            let user_roles = user.roles as string[]
            let allowed_roles = req.query.roles as string[]
            // Check for overlap
            if(allowed_roles.filter((r)=>user_roles.includes(r)).length>0)
                return res.status(200).send()
            return res.status(401).send()
        } catch(err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getCheckinHistory: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
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
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            // Get part id filters
            let nxids = Array.isArray(req.query.nxids) ? req.query.nxids as string[] : [] as string[]
            nxids = nxids.filter((s)=>isValidPartID(s))

            let hideOtherParts = req.query.hideOthers == "true" ? true : false
            let palletUpdates = await getPalletUpdates(startDate, endDate, users, nxids)

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

            let palletUpdates = await getPalletUpdates(startDate, endDate, users, nxids)

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
                let event = await getEbayEvent(a, hideOtherParts?nxids:undefined)
                return event[0]
            }))
            res.status(200).json({total: totalUpdates, pages: getNumPages(pageSize, totalUpdates), events: returnValue});
        } catch (err) {
            // Error
            handleError(err)
            res.status(500).send("API could not handle your request: " + err);
        }
    }
}
export default userManager

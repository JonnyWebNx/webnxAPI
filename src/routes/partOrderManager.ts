import handleError from "../util/handleError.js";
import callbackHandler from '../util/callbackHandlers.js'
import { CartItem, CheckInQueuePart, InventoryEntry, NotificationTypes, PartRecordSchema, PartRequestSchema, UserSchema } from "../interfaces.js";
import { MongooseError } from "mongoose";
import { Request, Response } from "express";
import {
    cartItemsValidAsync,
    sanitizeCartItems,
    combineAndRemoveDuplicateCartItems,
    checkPartThreshold,
    getKiosksAsync,
    isValidPartID,
    getKioskNamesAsync,
} from '../methods/partMethods.js';
import { updatePartsAddSerialsAsync, getAddedAndRemovedCartItems, updatePartsAddSerialsDryRunAsync, updatePartsAsync } from '../methods/assetMethods.js';
import { getNumPages, getPageNumAndSize, getStartAndEndDate } from '../methods/genericMethods.js';
import { stringSanitize } from '../util/sanitize.js';
import PartOrder from '../model/partOrder.js';
import BuildKit from '../model/buildKit.js';
import { pushPayloadToRole, sendNotificationToGroup, sendNotificationToUser } from '../methods/notificationMethods.js';
import PartRecord from "../model/partRecord.js";
import Box from "../model/box.js";
import { isValidBoxTag } from "../methods/boxMethods.js";

const partOrderManager = {
    createPartOrder: async (req: Request, res: Response) => {
        try {
            // Parse the cart items from the request
            let parts = sanitizeCartItems(req.body.parts)
            let notes = stringSanitize(req.body.notes, false)
            if((!parts||(parts&&parts.length==0))&&(!notes||notes==""))
                return res.status(400).send("No data on order.")
            // Check if the cart items are valid
            if(!(await cartItemsValidAsync(parts)))
                return res.status(400).send("Error in requested parts")
            // Create the reqest in the db
            PartOrder.create({
                created_by: req.user.user_id,
                building: req.user.building,
                date_created: Date.now(),
                ordered_parts: parts,
                create_notes: notes
            })
            .then(() => {
                res.status(200).send("Success")
            })
            .catch((err)=>{
                res.status(500).send("API could not handle your request: " + err);
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getActivePartOrders: async (req: Request, res: Response) => {
        try {
            PartOrder.find({
                date_received: null,
                cancelled: {$ne: true},
            }).exec()
            .then((orders) => {
                res.status(200).send(orders)
            })
            .catch((err)=>{
                res.status(500).send("API could not handle your request: " + err);
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getPartOrderByID: async (req: Request, res: Response) => {
        try {
            let { id } = req.query
            PartOrder.findById(id).exec()
            .then((order) => {
                res.status(200).send(order)
            })
            .catch((err)=>{
                res.status(500).send("API could not handle your request: " + err);
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getReceivedPartOrders: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            PartOrder.aggregate([
            {
                $match: {
                    date_received: { $lte: endDate, $gte: startDate },
                    $or: [
                        {created_by: users && users.length > 0 ? { $in: users } : { $ne: null }},
                        {received_by: users && users.length > 0 ? { $in: users } : { $ne: null }}
                    ],
                }
            },
            {
                $sort: {
                    "date_received": -1
                }
            }
            ]).exec()
            .then((orders)=>{
                res.status(200).send({total: orders.length, pages: getNumPages(pageSize, orders.length), events: orders.splice(pageSkip, pageSize)})
            })
            .catch((err)=>{
                return res.status(500).send("API could not handle your request: " + err);
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    cancelPartOrder: async (req: Request, res: Response) => {
        try {
            let { id, notes } = req.body
            if(id)
                PartOrder.findOneAndUpdate(
                    {
                        _id: id,
                        date_fulfilled: null,
                        cancelled: {$ne: true},
                    }, 
                    {
                        cancelled: true,
                        date_received: Date.now(),
                        received_by: req.user.user_id,
                        received_notes: notes
                    }
                )
                .then(async (request)=>{
                    if(!request)
                        return res.status(400).send("Order not found")
                    res.status(200).send("Success")
                })
                .catch((err)=>{
                    return res.status(500).send("API could not handle your request: " + err);
                })
            else
                res.status(400).send("Order not found.");
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    receiveOrder: async (req: Request, res: Response) => {
        try {
            let { order_id, list, notes, approved, boxes, per_unit } = req.body
            approved = eval(approved)
            let current_date = Date.now();
            list = list as {kiosk: string, parts: InventoryEntry[]}[]
            // Create array for cart items
            let cartItems = [] as CartItem[]
            let serializedParts = [] as CartItem[]
            let perUnitMap = new Map<string, number>()
            let perUnitArray = []
            let kiosks = await getKioskNamesAsync(req.user.building)

            for (let u of per_unit) {
                if(u.nxid&&u.cost&&isValidPartID(u.nxid)&&!isNaN(u.cost)) {
                    perUnitMap.set(u.nxid, u.cost)
                    perUnitArray.push({nxid: u.nxid, cost: u.cost})
                }
            }
            // Get part request
            let partOrder = await PartOrder.findById(order_id)
            // Return error if it does not exist
            if(!partOrder)
                return res.status(400).send("Part order not found")
            // Return error if cancelled
            if(partOrder.cancelled)
                return res.status(400).send("Part order cancelled")
            if(partOrder.date_received)
                return res.status(400).send("Part order already fulfilled")
            // Filter out duplicate kiosks
            list = list.filter((v: any, i: any, arr: any)=>arr.findIndex((k: any)=>k.kiosk==v.kiosk)==i)
            // Convert request parts to cart items
            for(let entry of list) {
                // Loop through request
                for(let p of entry.parts) {
                    // Push unserialized cart items to array
                    cartItems.push({nxid: p.nxid, quantity: p.unserialized+p.serials.length})
                    // Keep copy of serialized parts
                    serializedParts = serializedParts.concat(p.serials.map((s: string)=>{
                        return {nxid: p.nxid, serial: s}
                    }))
                }
            }
            // Combine and remove duplicates
            cartItems = combineAndRemoveDuplicateCartItems(cartItems)
            // Filter for box array
            let boxArr = list
                .filter((i: {kiosk: string, parts: InventoryEntry[]})=>i.kiosk=="Box")
            // Get it as object
            let boxKiosk = boxArr.length == 1 ? boxArr[0] : undefined
            // Boxes will be ignored if boxKiosk is not present
            if(boxKiosk) {
                // Reset cart items var
                cartItems = []
                // Loop through all the boxes
                for (let box of boxes) {
                    // Push box parts as cart items
                    cartItems = cartItems.concat(box.parts.map((v: any)=>{
                        return {
                            nxid: v.nxid,
                            quantity: v.unserialized + v.serials.length
                        }
                    }))
                }
                // Combine and remove dupes
                cartItems = combineAndRemoveDuplicateCartItems(cartItems)
                // Map box kiosk parts
                let boxKioskParts = boxKiosk.parts.map((v: any)=>{
                    return {
                        nxid: v.nxid,
                        quantity: v.unserialized + v.serials.length
                    }
                })
                // Check if boxes match kiosk
                let diff = getAddedAndRemovedCartItems(cartItems, boxKioskParts)
                // If there are differences or error in parsing, return error
                if(diff.added.length!=0||diff.removed.length!=0||diff.error)
                    return res.status(400).send("Error in box list.")
            }
            let locations = [] as string[]
            // Check if submission matches part request ✅
            list = list
                .filter((i: {kiosk: string, parts: InventoryEntry[]}) => {
                    if(kiosks.includes(i.kiosk)) {
                        return true
                    }
                    else {
                        if(i.kiosk!="Box")
                            locations.push(i.kiosk)
                        return false
                    }
                })
            if(locations.length>0)
                return res.status(400).send("\""+locations.join("\", \"")+(locations.length>1?"\" are not valid locations." : "\" is not a valid location."))
            // Generate the create options
            // Update the box parts
            let boxUpdates = await Promise.all(
                boxes.map(async (item: {box_tag: string, parts: InventoryEntry[]})=>{
                    let createOptions = {
                        location: "Box",
                        box_tag: item.box_tag,
                        building: partOrder!.building,
                        by: req.user.user_id,
                        next: null,
                        date_created: current_date,
                        order_id
                    }
                    // Check for existing box
                    let existingBox = await Box.findOne({box_tag: item.box_tag})
                    // If box does not exist
                    if(existingBox==null) {
                        // Create it
                        await Box.create({
                            box_tag: item.box_tag,
                            location: "Part Order",
                            building: req.user.building,
                            notes: "Box was generated automatically through a received part order.",
                            by: req.user.user_id,
                            date_created: current_date,
                            next: null,
                            prev: null,
                        })
                    }
                    // Map the ie to cart items
                    let cartItems = [] as CartItem[]
                    for(let ie of item.parts) {
                        if(ie.unserialized>0) {
                            cartItems.push({nxid: ie.nxid!, quantity: ie.unserialized})
                        }
                        for(let s of ie.serials) {
                            cartItems.push({nxid: ie.nxid!, serial: s})
                        }
                    }
                    // Update em ayyyyyy
                    await updatePartsAsync(createOptions, {}, cartItems, true)
                    return { box_tag: item.box_tag, parts: cartItems }
                })
            )
            // Update the regular kiosk parts
            let kioskUpdates = await Promise.all(
                list.map(async (item: {kiosk: string, parts: InventoryEntry[]})=>{
                    let createOptions = {
                        location: item.kiosk,
                        building: partOrder!.building,
                        by: req.user.user_id,
                        next: null,
                        date_created: current_date,
                        order_id
                    }
                    // Map the ie to cart items
                    let cartItems = [] as CartItem[]
                    for(let ie of item.parts) {
                        if(ie.unserialized>0) {
                            cartItems.push({nxid: ie.nxid!, quantity: ie.unserialized})
                        }
                        for(let s of ie.serials) {
                            cartItems.push({nxid: ie.nxid!, serial: s})
                        }
                    }
                    // Update em ayyyyyy
                    await updatePartsAsync(createOptions, {}, cartItems, true)
                    return { kiosk: item.kiosk, parts: cartItems }
                })
            )
            let finalPartsList = kioskUpdates.concat(boxUpdates)
            // Update the request and send notifications
            PartOrder.findByIdAndUpdate(order_id, {
                received_by: req.user.user_id,
                date_received: current_date,
                received_parts: finalPartsList,
                received_notes: notes,
                per_unit_costs: perUnitArray
            })
            .then(()=>{
                res.status(200).send("Success")
            })
            .catch((err)=>{
                res.status(500).send("API could not handle your request: " + err);
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
};

export default partOrderManager;

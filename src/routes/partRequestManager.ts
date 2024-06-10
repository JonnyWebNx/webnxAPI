import handleError from "../util/handleError.js";
import callbackHandler from '../util/callbackHandlers.js'
import { CartItem, InventoryEntry, NotificationTypes, PartRequestSchema } from "../interfaces.js";
import { MongooseError } from "mongoose";
import { Request, Response } from "express";
import {
    cartItemsValidAsync,
    sanitizeCartItems,
    combineAndRemoveDuplicateCartItems,
    checkPartThreshold,
} from '../methods/partMethods.js';
import { updatePartsAddSerialsAsync, getAddedAndRemovedCartItems, updatePartsAddSerialsDryRunAsync } from '../methods/assetMethods.js';
import { getNumPages, getPageNumAndSize, getStartAndEndDate } from '../methods/genericMethods.js';
import { stringSanitize } from '../util/sanitize.js';
import PartRequest from '../model/partRequest.js';
import BuildKit from '../model/buildKit.js';
import { pushPayloadToRole, sendNotificationToGroup, sendNotificationToUser } from '../methods/notificationMethods.js';

const partRequestManager = {
    createPartRequest: async (req: Request, res: Response) => {
        try {
            // Parse the cart items from the request
            let parts = sanitizeCartItems(req.body.parts)
            let notes = stringSanitize(req.body.notes, false)
            // Check if the cart items are valid
            if(!(await cartItemsValidAsync(parts)))
                return res.status(400).send("Error in requested parts")
            // Create the reqest in the db
            PartRequest.create({
                requested_by: req.user.user_id,
                building: req.user.building,
                date_created: Date.now(),
                parts,
                tech_notes: notes
                
            })
            .then(()=>{
                return sendNotificationToGroup('fulfill_part_requests', NotificationTypes.Alert, "There is a new part request.", "/clerk/partRequests")
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

    getActivePartRequests: async (req: Request, res: Response) => {
        try {

            let user_id = req.query.id

            PartRequest.find({
                date_fulfilled: null,
                cancelled: {$ne: true},
                requested_by: user_id ? user_id : {$ne: null}
            }, (err: MongooseError, requests: PartRequestSchema)=>{
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                res.status(200).send(requests)
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    getFulfilledPartRequests: async (req: Request, res: Response) => {
        try {
            let { pageSize, pageSkip } = getPageNumAndSize(req);
            let { startDate, endDate } = getStartAndEndDate(req)
            let users = Array.isArray(req.query.users) ? req.query.users as string[] : [] as string[]
            PartRequest.aggregate([
            {
                $match: {
                    date_fulfilled: { $lte: endDate, $gte: startDate },
                    $or: [
                        {requested_by: users && users.length > 0 ? { $in: users } : { $ne: null }},
                        {fulfilled_by: users && users.length > 0 ? { $in: users } : { $ne: null }}
                    ],
                }
            },
            {
                $sort: {
                    "date_fulfilled": -1
                }
            }
            ], (err: MongooseError, requests: PartRequestSchema[])=>{
                if(err)
                    return res.status(500).send("API could not handle your request: " + err);
                res.status(200).send({total: requests.length, pages: getNumPages(pageSize, requests.length), events: requests.splice(pageSkip, pageSize)})
            })
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    cancelPartRequest: async (req: Request, res: Response) => {
        try {
            let { id } = req.body
            if(id)
                PartRequest.findOneAndUpdate(
                    {
                        _id: id,
                        requested_by: req.user.user_id,
                        date_fulfilled: null,
                        cancelled: {$ne: true},
                    }, 
                    {
                        cancelled: true,
                        date_fulfilled: Date.now(),
                        fulfilled_by: req.user.user_id
                    }
                )
                .then(async (request)=>{
                    if(!request)
                        return res.status(400).send("Request not found")
                    await pushPayloadToRole('fulfill_part_requests', {
                        type: 'partRequestRemoved',
                        id: request._id
                    })
                    await sendNotificationToGroup('fulfill_part_requests', NotificationTypes.Alert, "A part request has been cancelled.")
                    if(request.build_kit_id)
                        await BuildKit.findByIdAndUpdate(request?.build_kit_id, {
                            requested_by: null,
                            date_requested: null
                        }, callbackHandler.callbackHandleError)
                    res.status(200).send("Success")
                })
                .catch((err)=>{
                    return res.status(500).send("API could not handle your request: " + err);
                })
            else
                res.status(400).send("Part request not found.");
        }
        catch (err) {
            // Error
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },

    fulfillPartRequest: async (req: Request, res: Response) => {
        try {
            let { request_id, list, notes, approved, boxes } = req.body
            approved = eval(approved)
            let current_date = Date.now();
            list = list as {kiosk: string, parts: InventoryEntry[]}[]
            // Create array for cart items
            let cartItems = [] as CartItem[]
            let serializedParts = [] as CartItem[]
            // Get part request
            let partRequest = await PartRequest.findById(request_id)
            // Return error if it does not exist
            if(!partRequest)
                return res.status(400).send("Part request not found")
            // Return error if cancelled
            if(partRequest.cancelled)
                return res.status(400).send("Part request cancelled")
            // Return request if bad API route
            if(partRequest.build_kit_id)
                return res.status(400).send("Incorrect API route")
            // If request is denied
            if(approved != true) {
                PartRequest.findByIdAndUpdate(request_id, {
                    fulfilled_by: req.user.user_id,
                    date_fulfilled: current_date,
                    clerk_notes: notes,
                    denied: true
                })
                .then(async (request)=>{
                    await pushPayloadToRole('fulfill_part_requests', {
                        type: 'partRequestRemoved',
                        id: request!._id
                    })
                    return request
                })
                .then((request)=>{
                    return sendNotificationToUser(request!.requested_by, NotificationTypes.Alert, "Your part request has been denied.", "/partRequests/fulfilled")
                })
                .then(()=>{
                    res.status(200).send("Success")
                })
                .catch((err)=>{
                    res.status(500).send("API could not handle your request: " + err);
                })
                return
            }
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
            // Check for difference in parts list
            let diff = getAddedAndRemovedCartItems(cartItems, partRequest!.parts)
            // If there are differences or error in parsing, return error
            if(diff.added.length!=0||diff.removed.length!=0||diff.error)
                return res.status(400).send("Error in parts list.")
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
                diff = getAddedAndRemovedCartItems(cartItems, boxKioskParts)
                // If there are differences or error in parsing, return error
                if(diff.added.length!=0||diff.removed.length!=0||diff.error)
                    return res.status(400).send("Error in box list.")
            }
            // Check if submission matches part request ✅
            list = list
                .filter((i: {kiosk: string, parts: InventoryEntry[]}) => {
                    return i.kiosk!="Rejected"&&i.kiosk!="Box"
                })
            // Update the box parts
            let boxDryRun = await Promise.all(boxes.map(async (item: {box_tag: string, parts: InventoryEntry[]})=>{
                // Get parts from kiosk
                let searchOptions = {
                    next: null,
                    box_tag: item.box_tag,
                    building: partRequest?.building
                }
                // Dry run update - check if any are skipped
                let { updated, skipped } = await updatePartsAddSerialsDryRunAsync(searchOptions, item.parts)
                // Update em ayyyyyy
                return { box_tag: item.box_tag, updated, skipped }
            }))
            // Check all of the boxes
            for(let b of boxDryRun) {
                // If parts were skipped
                if(b.skipped.length>0) {
                    // Return an error message
                    return res.status(400).send(`Error updating parts on box ${b.box_tag} (Dry run)`)
                }
            }
            // Update the regular kiosk parts
            let kioskDryRun = await Promise.all(list.map(async (item: {kiosk: string, parts: InventoryEntry[]})=>{
                // Get parts from kiosk
                let searchOptions = {
                    next: null,
                    location: item.kiosk,
                    building: partRequest?.building
                }
                // Dry run update - check if any are skipped
                let { updated, skipped } = await updatePartsAddSerialsDryRunAsync(searchOptions, item.parts)
                return { kiosk: item.kiosk, updated, skipped }
            }))
            // Check all of the boxes
            for(let k of kioskDryRun) {
                // If parts were skipped
                if(k.skipped.length>0) {
                    // Return an error message
                    return res.status(400).send(`Error updating parts on kiosk ${k.kiosk} (Dry run)`)
                }
            }
            // Generate the create options
            let createOptions = {
                owner: partRequest.requested_by,
                location: "Tech Inventory",
                building: partRequest.building,
                by: req.user.user_id,
                next: null,
                date_created: current_date,
            }
            // Update the box parts
            let boxUpdates = await Promise.all(boxes.map(async (item: {box_tag: string, parts: InventoryEntry[]})=>{
                // Get parts from kiosk
                let searchOptions = {
                    next: null,
                    box_tag: item.box_tag,
                    building: partRequest?.building
                }
                // Update em ayyyyyy
                let { updated } = await updatePartsAddSerialsAsync(createOptions, searchOptions, item.parts)
                return { box_tag: item.box_tag, parts: updated }
            }))
            // Update the regular kiosk parts
            let kioskUpdates = await Promise.all(list.map(async (item: {kiosk: string, parts: InventoryEntry[]})=>{
                // Get parts from kiosk
                let searchOptions = {
                    next: null,
                    location: item.kiosk,
                    building: partRequest?.building
                }
                // Update em ayyyyyy
                let { updated } = await updatePartsAddSerialsAsync(createOptions, searchOptions, item.parts)
                return { kiosk: item.kiosk, parts: updated }
            }))
            // Update the request and send notifications
            PartRequest.findByIdAndUpdate(request_id, {
                fulfilled_by: req.user.user_id,
                date_fulfilled: current_date,
                fulfilled_list: kioskUpdates,
                boxes: boxUpdates,
                clerk_notes: notes
            })
            .then(async (request)=>{
                await pushPayloadToRole('fulfill_part_requests', {
                    type: 'partRequestRemoved',
                    id: request!._id
                })
                return request
            })
            .then((request)=>{
                return sendNotificationToUser(request!.requested_by, NotificationTypes.Alert, "Your part request has been approved.", "/partRequests/fulfilled")
            })
            .then(()=>{
                res.status(200).send("Success")
            })
            .then(()=>{
                partRequest?.parts.map((ci)=>{
                    checkPartThreshold(ci.nxid, req.user.building)
                })
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

export default partRequestManager;

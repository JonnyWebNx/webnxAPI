import mongoose from "mongoose";
import { PartRecordSchema } from "../interfaces.js";

const partRecord = new mongoose.Schema({
    // NXID of the associated part
    nxid: { type: String, required: true },
    // ID of the previous record, null if oldest iteration of record
    prev: { type: String, default: null },
    // ID of the next record, null if newest iteration of record
    next: { type: String, default: null},
    // Location: LA - 1, OG - 3, NY - 4
    building: { type: Number, required: true },
    // Parts Room, Workbench, Testing, Asset, Etc.
    location: { type: String, required: true},
    // Asset tag if associated with an asset
    asset_tag: { type: String },
    //
    pallet_tag: { type: String },
    // Box tag if associated with a box
    box_tag: { type: String },
    // Serial number (if part is in asset)
    serial: { type: String },
    // User ID of owner if part is checked out
    owner: { type: String },
    // FOR EBAY
    ebay: { type: String },
    // ID of the user who's request created the part record
    by: { type: String, required: true },
    // Request where the parts came from
    part_request: { type: String },
    // Build kittttt
    kit_id: { type: String },
    // Kiosk for the build kit
    kiosk: { type: String },
    // Date the part was created
    date_created: { type: Date, default: new Date() },
    date_replaced: { type: Date, default: null },
    // This will greatly optimize analytics requests
    next_owner: { type: String }
});
// Add index here
export default mongoose.model<PartRecordSchema>("partRecord", partRecord);

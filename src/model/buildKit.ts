import mongoose from "mongoose";
import { BuildKitSchema, CartItem } from "../interfaces.js";

const buildKit = new mongoose.Schema({
    // ID of the user who requested parts
    kit_name: { type: String, required: true },
    building: { type: Number, required: true },
    kiosk: { type: String, required: true },
    // parts on the request
    claimed_parts: { type: Array<CartItem> },
    // Not actually deleted
    deleted_parts: { type: Array<{kiosk: string, parts: CartItem[]}> },
    // Date the part request was created
    date_created: { type: Date, default: new Date() },
    date_requested: { type: Date, default: null },
    date_claimed: { type: Date, default: null },
    date_deleted: { type: Date, default: null },
    // User data
    created_by: { type: String, default: null },
    requested_by: { type: String, default: null },
    claimed_by: { type: String, default: null },
    deleted_by: { type: String, default: null },
    // Is deleted?
    deleted: { type: Boolean, default: false },
    // Notes
    notes: { type: String, default: "" },
});
// Add index here
export default mongoose.model<BuildKitSchema>("buildKit", buildKit);

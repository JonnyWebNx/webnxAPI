import mongoose from "mongoose";
import { CartItem, PartRequestSchema } from "../interfaces.js";

const partRequest = new mongoose.Schema({
    // ID of the user who requested parts
    requested_by: { type: String, required: true },
    building: { type: Number, required: true },
    // parts on the request
    parts: { type: Array<CartItem>, required: true},
    build_kit_id: { type: String },
    // Date the part request was created
    date_created: { type: Date, default: new Date() },
    // Date the part request was fulfilled
    date_fulfilled: { type: Date, default: null },
    // Fulfilled by
    fulfilled_by: { type: String, default: null },
    fulfilled_list: { type: Array<any> },
    boxes: { type: Array<any> },
    // Cancelled?
    cancelled: { type: Boolean },
    denied: { type: Boolean },
    tech_notes: { type: String, default: "" },
    clerk_notes: { type: String, default: null },
});
// Add index here
export default mongoose.model<PartRequestSchema>("partRequest", partRequest);

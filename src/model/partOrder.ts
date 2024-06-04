import mongoose from "mongoose";
import { CartItem, PartOrderSchema } from "../interfaces.js";

const partOrder = new mongoose.Schema({
    building: { type: Number, required: true },
    // Order info
    per_unit_costs: { type: Array<any> },
    ordered_parts: { type: Array<CartItem>, required: true},
    created_by: { type: String, required: true },
    create_notes: { type: String },
    date_created: { type: Date, default: new Date() },
    // Received info
    received_by: { type: String },
    received_notes: { type: String },
    date_received: { type: Date, default: null },
    received_parts: { type: Array<any> },
    cancelled: { type: Boolean },
});
// Add index here
export default mongoose.model<PartOrderSchema>("partOrder", partOrder)

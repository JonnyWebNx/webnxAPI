import mongoose from "mongoose";
import { BoxSchema } from "../interfaces.js";

const boxSchema = new mongoose.Schema({
    box_tag: { type: String, required: true },
    location: { type: String, required: true },
    prev_location: { type: String },
    next_location: { type: String },
    migrated: { type: Boolean },
    building: { type: Number, required: true },
    by: { type: String, required: true },
    date_created: { type: Date, default: Date.now() },
    date_replaced: { type: Date },
    next: { type: String, default: null },
    prev: { type: String, default: null },
    notes: { type: String }
});

export default mongoose.model<BoxSchema>("box", boxSchema);

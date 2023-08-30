import mongoose from "mongoose";
import { PalletSchema } from "../app/interfaces.js";

const palletSchema = new mongoose.Schema({
    pallet_tag: { type: String, required: true, unique: true },
    location: { type: String, required: true },
    building: { type: Number, required: true },
    by: { type: String, required: true },
    date_created: { type: Date, default: Date.now() },
    date_replaced: { type: Date },
    next: { type: String, default: null },
    prev: { type: String, default: null },
    notes: { type: String }
});

export default mongoose.model<PalletSchema>("pallet", palletSchema);

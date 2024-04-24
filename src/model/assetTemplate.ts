import mongoose from "mongoose";
import { AssetSchema } from "../interfaces.js";

const assetTemplate = new mongoose.Schema({
    template_name: { type: String, required: true},
    // Location: LA - 1, OG - 3, NY - 4
    building: { type: Number, required: true },
    // Asset type
    asset_type: { type: String },
    // Chassis type
    chassis_type: { type: String},
    // Manufacturer
    manufacturer: { type: String },
    // Model name
    model: { type: String },
    // Has rails
    rails: { type: Boolean },
    // Cheater rails?
    cheat: {type: Boolean},
    // 1U, 2U, 3U, etc.
    units: { type: Number },
    // POWER SUPPLY
    num_psu: { type: Number },
    psu_model: { type: String },
    // Cable length
    cable_type: { type: String },
    num_bays: { type: Number },
    bay_type: { type: String }, 
    pallet: { type: String },
    fw_rev: { type: String },
    // Status
    live: { type: Boolean, default: false},
    in_rack: { type: Boolean },
    // Bay
    bay: { type: Number },
    // Last updated by
    by: { type: String, required: true },
    // Parts
    notes: { type: String },
    parts: { type: Array<any> }
});
// Add index here
export default mongoose.model<AssetSchema>("assetTemplate", assetTemplate);

import mongoose from "mongoose";
import { AssetSchema } from "../app/interfaces.js";

const asset = new mongoose.Schema({
    // NXID of the associated part
    asset_tag: { type: String, required: true },
    // ID of the previous record, nul if oldest iteration of record
    prev: { type: String, default: null },
    // ID of the next record, null if newest iteration of record
    next: { type: String, default: null},
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
    // Serial number
    serial: { type: String },
    // Has rails
    rails: { type: Boolean },
    // Cheater rails?
    cheat: {type: Boolean},

    // 1U, 2U, 3U, etc.
    units: { type: Number },
    // POWER SUPPLY
    num_psu: { type: Number },
    psu_model: { type: String },
    // Node
    parent: { type: String },
    // Cable length
    cable_type: { type: String },
    num_bays: { type: Number },
    bay_type: { type: String }, 
    pallet: { type: String },
    fw_rev: { type: String },
    migrated: { type: Boolean },
    // Status
    live: { type: Boolean, default: false},
    in_rack: { type: Boolean },
    // Bay
    bay: { type: Number },
    // Physical location
    power_port: { type: String },
    public_port: { type: String },
    private_port: { type: String },
    ipmi_port: { type: String },
    
    // Emails from migration
    old_by: { type: String },
    
    // Last updated by
    by: { type: String, required: true },
    sid: { type: Number },
    // Parts
    // Date the part was created
    date_created: { type: Date },
    date_updated: { type: Date },
    date_replaced: { type: Date, default: null },
    notes: { type: String }
});
asset.index({
    'notes': 'text',
    'sid': 'text',
    'pallet': 'text',
    'manufacturer': 'text',
    'model': 'text',
    'serial': 'text',
    'power_port': 'text',
    'public_port': 'text',
    'private_port': 'text',
    'ipmi_port': 'text'
});
// Add index here
export default mongoose.model<AssetSchema>("asset", asset);

import mongoose from "mongoose";

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
    // Status
    live: { type: Boolean, default: false},
    // Bay
    bay: { type: Number },
    // Physical location
    power_port: { type: String },
    public_port: { type: String },
    private_port: { type: String },
    ipmi_port: { type: String },
    // Last updated by
    by: { type: String, required: true },
    sid: { type: Number },
    // Parts
    // Date the part was created
    date_created: { type: Date, default: Date.now() },
});
// Add index here
export default mongoose.model("asset", asset);

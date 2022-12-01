const mongoose = require("mongoose");

const asset = new mongoose.Schema({
    // NXID of the associated part
    asset_tag: { type: String, required: true, unique: true },
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
    // Physical location
    location: { type: String, required: true },
    // Last updated by
    by: { type: String, required: true },
    // Parts
    parts: { type: Array },
    // Date the part was created
    date_created: { type: Date, default: Date.now },
    date_updated: { type: Date, default: Date.now }
});
// Add index here
module.exports = mongoose.model("asset", asset);
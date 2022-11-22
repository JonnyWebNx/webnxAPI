const mongoose = require("mongoose");

const partRecord = new mongoose.Schema({
    // NXID of the associated part
    nxid: { type: String, required: true },
    // Previous record, null if oldest iteration of record
    prev: { type: String, required: true },
    // Next record, null if newest iteration of record
    next: { type: String, required: true},
    // Location: LA, OG, NY
    building: { type: String, required: true },
    // Parts Room, Workbench, Testing, Asset, Etc.
    location: { type: String, required: true},
    // Asset tag if associated with an asset
    asset_tag: { type: String },
    // User ID of owner if part is checked out
    owner: { type: String, required: true },
    // Date the part was created
    date_created: { type: Date, default: Date.now },
});
// Add index here
module.exports = mongoose.model("partRecord", partRecord);
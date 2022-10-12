const mongoose = require("mongoose");

const partSchema = new mongoose.Schema({
    nxid: { type: String, default: null},
    manufacturer: { type: String, default: null},
    name: { type: String, default: null},
    type: { type: String, default: null},
    capacity: { type: Number, default: null},
    capacity_unit: { type: String, default: null},
    ports: { type: Number, default: null},
    port_type: { type: String, default: null},
    cable_end1: { type: String, default: null},
    cabled_end2: { type: String, default: null},
    created_by: { type: String, default: "Cornelius"},
    date_created: { type: Date, default: Date.now },
});

module.exports = mongoose.model("part", partSchema);
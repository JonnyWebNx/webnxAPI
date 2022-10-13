const mongoose = require("mongoose");

const partSchema = new mongoose.Schema({
    nxid: { type: String, default: null},
    manufacturer: { type: String, default: null},
    name: { type: String, default: null},
    type: { type: String, default: null},
    quantity: { type: Number, default: 0 },
    frequncy: { type: Number },
    capacity: { type: Number},
    capacity_unit: { type: String},
    ports: { type: Number},
    port_type: { type: String},
    cable_end1: { type: String},
    cabled_end2: { type: String},
    created_by: { type: String, default: null},
    date_created: { type: Date, default: Date.now },
});

module.exports = mongoose.model("part", partSchema);
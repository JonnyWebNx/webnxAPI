const mongoose = require("mongoose");

const partSchema = new mongoose.Schema({
    nxid: { type: String, required: true, default: null},
    manufacturer: { type: String, required: true, default: null},
    name: { type: String, required: true, default: null},
    type: { type: String, required: true, default: null},
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
partSchema.index({'$**': 'text'});
module.exports = mongoose.model("part", partSchema);
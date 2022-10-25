const mongoose = require("mongoose");

const partSchema = new mongoose.Schema({
    nxid: { type: String, required: true },
    manufacturer: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    location: { type: String, required: true },
    quantity: { type: Number, default: 0 },
    frequency: { type: Number },
    chipset: { type: Number },
    memory_type: { type: String },
    peripheral_type: { type: String },
    storage_interface: { type: String },
    capacity: { type: Number },
    capacity_unit: { type: String },
    num_ports: { type: Number },
    port_type: { type: String },
    cable_end1: { type: String },
    cable_end2: { type: String },
    created_by: { type: String, default: null },
    date_created: { type: Date, default: Date.now },
});
partSchema.index({'$**': 'text'});
module.exports = mongoose.model("part", partSchema);
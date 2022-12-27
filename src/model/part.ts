import mongoose from "mongoose";

const partSchema = new mongoose.Schema({
    nxid: { type: String, required: true, unique: true },
    manufacturer: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    frequency: { type: Number },
    chipset: { type: String },
    memory_type: { type: String },
    // new
    shelf_location: { type: String },
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
partSchema.index({ '$**': 'text' });
export default mongoose.model("part", partSchema);

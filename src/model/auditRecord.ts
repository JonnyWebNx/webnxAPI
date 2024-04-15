import mongoose from "mongoose";
import { AuditRecordSchema } from "../interfaces.js";

const auditRecord = new mongoose.Schema({
    // NXID of the associated part
    nxid: { type: String, required: true },
    // Kiosk for the build kit
    kiosk_quantities: { type: Array<any>, required: true },
    //
    building: { type: Number, required: true },
    // All of the parts in the building?
    total_quantity: { type: Number, required: true },
    // ID of the user who's request created the part record
    by: { type: String, required: true },
    notes: { type: String },
    // Date the part was created
    date: { type: Date, default: new Date() },
});
// Add index here
export default mongoose.model<AuditRecordSchema>("auditRecord", auditRecord);

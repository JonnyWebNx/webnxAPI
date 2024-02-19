import mongoose from "mongoose";
import { NotificationSchema } from "../app/interfaces.js";

const notificationSchema = new mongoose.Schema({
    user: { type: String, required: true },
    type: { type: String, required: true },
    text: { type: String, required: true },
    date: { type: Date, required: true },
    date_read: { type: Date },
    link: { type: String }
});

export default mongoose.model<NotificationSchema>("notification", notificationSchema);

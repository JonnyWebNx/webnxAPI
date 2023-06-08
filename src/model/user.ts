/**
 * 
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief MongoDB schema for Users
 * 
 */
import mongoose from "mongoose";
import { UserSchema } from "../app/interfaces.js";

const userSchema = new mongoose.Schema({
    first_name: { type: String, required: true, default: null },
    last_name: { type: String, required: true, default: null },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    building: { type: Number, required: true},
    roles: { type: Array<String>, default: ["tech"] },
    enabled: { type: Boolean, default: false },
    date_created: { type: Date, default: Date.now() },
    token: { type: String },
});

export default mongoose.model<UserSchema>("user", userSchema);

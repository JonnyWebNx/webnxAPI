/**
 * 
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief MongoDB schema for password reset tokens
 * 
 */
import mongoose from "mongoose";
import { ResetToken } from "../interfaces.js";

const resetToken = new mongoose.Schema({
    userId: { type: String, required: true },
    token: { type: String, required: true },
    createdAt: { type: Date, default: Date.now(), expires: 3600 },
});

export default mongoose.model<ResetToken>("resetToken", resetToken);

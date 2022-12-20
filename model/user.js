/**
 * 
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief MongoDB schema for Users
 * 
 */
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    first_name: { type: String, required: true, default: null },
    last_name: { type: String, required: true, default: null },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    building: { type: Number, required: true},
    inventory_perms: { type: Boolean, default: false },
    role: { type: String, default: false },
    enabled: { type: Boolean, default: true },
    date_created: { type: Date, default: Date.now },
    token: { type: String },
});

module.exports = mongoose.model("user", userSchema);

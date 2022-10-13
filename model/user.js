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
    first_name: { type: String, default: null },
    last_name: { type: String, default: null },
    email: { type: String, unique: true },
    password: { type: String },
    admin: { type: Boolean, default: false },
    date_created: { type: Date, default: Date.now },
    token: { type: String },
});

module.exports = mongoose.model("user", userSchema);
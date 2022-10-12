const mongoose = require("mongoose");

const partSchema = new mongoose.Schema({
    nxid: { type: String, default: null},
    manufacturer: { type: String, default: null},
    name: { type: String, default: null},
    type: { type: String, default: null},
    attributes: { type: Object, default: {}},
    date_created: { type: Date, default: Date.now },
});

module.exports = mongoose.model("part", partSchema);
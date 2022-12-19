/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Creates a connect to MongoDB database at MONGO_URI
 * 
 */
const mongoose = require("mongoose");
const { MONGO_URI } = process.env;
const handleError = require("../config/mailer")

// Connects when imported
exports.connect = () => {
    // Connect to the database
    mongoose.connect(MONGO_URI)
    .then(() => {
        // Successfully connected
        console.log("Connected to the database")
    })
    .catch((err)=>{
        // Could not connect.  Stop server
        handleError(err)
        console.log("COULD NOT CONNECT TO DATABASE. ABORTING START...");
        console.error(err);
        process.exit(1);
    });
}
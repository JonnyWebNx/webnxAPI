/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Main application for handling incoming requests
 * 
 * 
 */
// Import npm modules
require("dotenv").config();
require("./config/database").connect();
const express = require("express");
const cors = require("cors");


// authorization modules
const login = require("./app/login");
const register = require("./app/register");
const auth = require("./middleware/auth");

// Database modules
const partManager = require("./app/partManager");
const userManager = require("./app/userManager");

// Create express instance
const app = express();

// Set up middleware
// ***   CRUD only   ***
app.use(cors({
    "origin": "*",
    "methods": "GET,PUT, POST, DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204
}));
// JSON middleware...
app.use(express.json());

// ***   Authentication   ***
//
// Login
app.post("/login", login);
// Register
app.post("/register", register);

// ***   Parts   ***
//
// Create
app.post("/part", auth, partManager.createPart);
// Read
app.get("/part", auth, partManager.getPart);
// Update
app.put("/part", auth, partManager.updatePart);
// Delete
app.delete("/part", auth, partManager.deletePart);

// ***   Users   ***
//
// Create
app.post("/user", auth, userManager.createUser);
// Read
app.get("/user", auth, userManager.getUser);
// Update
app.put("/user", auth, userManager.updateUser);
// Delete
app.delete("/user", auth, userManager.deleteUser);


// Catch all - BAD REQUEST
app.post("*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.get("*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.put("*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.delete("*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});

module.exports = app;
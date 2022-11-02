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
const isAuth = require("./app/isAuth");
const permissions = require("./middleware/permissions");

// Database modules
const partManager = require("./app/partManager");
const userManager = require("./app/userManager");
const sanitize = require("./middleware/sanitize");
// Create express instance
const app = express();

// Set up middleware
app.use(cors({
    "origin": "http://localhost:8080",
    "credentials": true,
    "methods": "GET,PUT, POST, DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204
}));
// JSON middleware...
app.use(express.json());

app.post("/api/auth", auth, isAuth);

app.use("/static", auth, express.static("public"))

// ***   Authentication   ***
//
// Login
app.post("/api/login", login);
// Register
app.post("/api/register", register);

// ***   Parts   ***
//
// Create
app.post("/api/part", auth, permissions, sanitize, partManager.createPart);
app.post("/api/checkout", auth, sanitize, partManager.checkout);
app.post("/api/checkin", auth, sanitize, partManager.checkin)
// Read
app.get("/api/part", auth, sanitize, partManager.getPart);
app.get("/api/part/id", auth, sanitize, partManager.getPartByID)
app.get("/api/part/search", auth, sanitize, partManager.searchParts);
// Update
app.put("/api/part", auth, permissions, sanitize, partManager.updatePart);
// Delete
app.delete("/api/part", auth, permissions, sanitize, partManager.deletePart);


// ***   Users   ***
//
// Create
app.post("/api/user", auth, permissions, sanitize, userManager.createUser);
// Read
app.get("/api/user", auth, sanitize, userManager.getUser);
app.get("/api/user/all", auth, permissions, userManager.getAllUsers)
// Update
app.put("/api/user", auth, sanitize, permissions, userManager.updateUser);
// Delete
app.delete("/api/user", auth, permissions, sanitize, userManager.deleteUser);


// Catch all - BAD REQUEST
app.post("*", async (req, res) => {
    console.log(req.url)
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
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

// Database modules
const partManager = require("./app/partManager");
const userManager = require("./app/userManager");

// Create express instance
const app = express();

// Set up middleware
// ***   CRUD only   ***
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

// ***   Authentication   ***
//
// Login
app.post("/api/login", login);
// Register
app.post("/api/register", register);

// ***   Parts   ***
//
// Create
app.post("/api/part", auth, partManager.createPart);
// Read
app.get("/api/part", auth, partManager.getPart);
// Update
app.put("/api/part", auth, partManager.updatePart);
// Delete
app.delete("/api/part", auth, partManager.deletePart);

// ***   Users   ***
//
// Create
app.post("/api/user", auth, userManager.createUser);
// Read
app.get("/api/user", auth, userManager.getUser);
// Update
app.put("/api/user", auth, userManager.updateUser);
// Delete
app.delete("/api/user", auth, userManager.deleteUser);


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